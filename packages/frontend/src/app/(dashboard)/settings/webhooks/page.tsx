'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Zap, Eye, EyeOff, TestTube2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { WebhookEndpoint } from '@/types';

const EVENT_TYPES = [
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'contact.created',
  'contact.updated',
  'contact.unsubscribed',
];

type WebhookRow = WebhookEndpoint;

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<number>>(new Set());

  // Form state
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [active, setActive] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.webhooks.list(),
    queryFn: () => api.get<{ data: WebhookRow[] }>('/webhook-endpoints'),
  });

  const webhooks = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/webhook-endpoints', { url, events, active: active }),
    onSuccess: () => {
      toast.success('Webhook created');
      resetForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
    },
    onError: () => {
      toast.error('Failed to create webhook');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/webhook-endpoints/${editingId}`, { url, events, active: active }),
    onSuccess: () => {
      toast.success('Webhook updated');
      resetForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
    },
    onError: () => {
      toast.error('Failed to update webhook');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/webhook-endpoints/${id}`),
    onSuccess: () => {
      toast.success('Webhook deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
    },
    onError: () => {
      toast.error('Failed to delete webhook');
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => api.post(`/webhook-endpoints/${id}/test`),
    onSuccess: () => {
      toast.success('Test event sent');
    },
    onError: () => {
      toast.error('Failed to send test');
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingId(null);
    setUrl('');
    setEvents([]);
    setActive(true);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (webhook: WebhookRow) => {
    setEditingId(webhook.id);
    setUrl(webhook.url);
    setEvents(webhook.events ?? []);
    setActive(webhook.active);
    setDialogOpen(true);
  };

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const toggleSecret = (id: number) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const columns: Column<WebhookRow>[] = [
    {
      key: 'url',
      header: 'URL',
      render: (w) => (
        <button
          onClick={() => openEdit(w)}
          className="text-xs font-medium text-text-primary hover:text-tw-blue transition-colors text-left"
        >
          {w.url}
        </button>
      ),
    },
    {
      key: 'events',
      header: 'Events',
      render: (w) => (
        <div className="flex flex-wrap gap-1">
          {(w.events ?? []).slice(0, 3).map((e) => (
            <Badge key={e} variant="secondary" className="text-[10px]">
              {e}
            </Badge>
          ))}
          {(w.events ?? []).length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{(w.events ?? []).length - 3}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (w) => (
        <Badge variant={w.active ? 'default' : 'secondary'} className="text-[10px]">
          {w.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'secret',
      header: 'Secret',
      render: (w) => (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-mono">
            {revealedSecrets.has(w.id) ? (w.secret ?? '---') : '••••••••'}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => toggleSecret(w.id)}
          >
            {revealedSecrets.has(w.id) ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
          </Button>
        </div>
      ),
    },
    {
      key: 'failure_count',
      header: 'Failures',
      render: (w) => (
        <span className={`text-xs ${(w.failure_count ?? 0) > 0 ? 'text-status-danger font-medium' : 'text-text-muted'}`}>
          {w.failure_count ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (w) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => testMutation.mutate(w.id)}
            title="Send test"
          >
            <TestTube2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setDeleteTarget(w)}
            className="text-text-muted hover:text-status-danger"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <Button
            className="bg-tw-blue hover:bg-tw-blue-dark"
            size="sm"
            onClick={openCreate}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Webhook
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          {!isLoading && webhooks.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No webhooks configured"
              description="Set up webhooks to receive real-time notifications about email events."
              actionLabel="Add Webhook"
              onAction={openCreate}
            />
          ) : (
            <DataTable
              columns={columns}
              data={webhooks}
              total={webhooks.length}
              page={1}
              perPage={100}
              onPageChange={() => {}}
              isLoading={isLoading}
              getId={(w) => w.id}
            />
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="webhook-url" className="text-xs text-text-muted mb-1.5">
                Endpoint URL
              </Label>
              <Input
                id="webhook-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/webhook"
              />
            </div>

            <div>
              <Label className="text-xs text-text-muted mb-2 block">Event Types</Label>
              <div className="grid grid-cols-1 gap-2">
                {EVENT_TYPES.map((event) => (
                  <label key={event} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={events.includes(event)}
                      onCheckedChange={() => toggleEvent(event)}
                    />
                    <span className="text-xs text-text-secondary">{event}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-text-muted">Active</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
              disabled={!url.trim() || events.length === 0 || createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Webhook"
        description={`Are you sure you want to delete the webhook for "${deleteTarget?.url}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
