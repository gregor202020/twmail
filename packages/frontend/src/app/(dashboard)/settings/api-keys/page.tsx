'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, MoreHorizontal, Trash2, RefreshCw, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, timeAgo } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const SCOPE_OPTIONS = [
  { value: 'read', label: 'Read', description: 'Read contacts, campaigns, reports' },
  { value: 'write', label: 'Write', description: 'Create and update contacts, campaigns' },
  { value: 'admin', label: 'Admin', description: 'Full access including settings and users' },
] as const;

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  scopes: z.array(z.string()).min(1, 'Select at least one scope'),
});
type CreateForm = z.infer<typeof createSchema>;

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKeyRow | null>(null);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  // --- Fetch keys ---
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.apiKeys.list,
    queryFn: () => api.get<{ data: ApiKeyRow[] }>('/api-keys').then(r => r.data),
  });

  const keys = data ?? [];

  // --- Create mutation ---
  const createMutation = useMutation({
    mutationFn: (values: CreateForm) => api.post<{ data: ApiKeyRow & { key: string } }>('/api-keys', values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list });
      setCreateOpen(false);
      setNewKeyValue(res.data.key);
      toast.success('API key created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Delete mutation ---
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list });
      setDeleteOpen(false);
      setSelectedKey(null);
      toast.success('API key deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Rotate mutation ---
  const rotateMutation = useMutation({
    mutationFn: (id: number) => api.post<{ data: ApiKeyRow & { key: string } }>(`/api-keys/${id}/rotate`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list });
      setRotateOpen(false);
      setSelectedKey(null);
      setNewKeyValue(res.data.key);
      toast.success('API key rotated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: Column<ApiKeyRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (k) => (
        <span className="text-xs font-medium text-text-primary">{k.name}</span>
      ),
    },
    {
      key: 'key_prefix',
      header: 'Key',
      render: (k) => (
        <span className="text-xs text-text-muted font-mono">{k.key_prefix}...</span>
      ),
    },
    {
      key: 'scopes',
      header: 'Scopes',
      render: (k) => (
        <div className="flex gap-1">
          {k.scopes.map((s) => (
            <span key={s} className="px-1.5 py-0.5 bg-surface rounded text-[10px] font-medium text-text-secondary uppercase">
              {s}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'last_used_at',
      header: 'Last Used',
      render: (k) => (
        <span className="text-xs text-text-muted">
          {k.last_used_at ? timeAgo(k.last_used_at) : 'Never'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (k) => (
        <span className="text-xs text-text-muted">{formatDate(k.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (k) => (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSelectedKey(k); setRotateOpen(true); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Rotate Key
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-status-danger focus:text-status-danger"
              onClick={() => { setSelectedKey(k); setDeleteOpen(true); }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Revoke Key
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <Button className="bg-tw-blue hover:bg-tw-blue-dark" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Create API Key
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          <DataTable
            columns={columns}
            data={keys}
            total={keys.length}
            page={1}
            perPage={100}
            onPageChange={() => {}}
            isLoading={isLoading}
            getId={(k) => k.id}
          />
        </div>
      </div>

      {/* Create Sheet */}
      <CreateKeySheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        isPending={createMutation.isPending}
      />

      {/* New Key Display */}
      {newKeyValue && (
        <NewKeyBanner keyValue={newKeyValue} onDismiss={() => setNewKeyValue(null)} />
      )}

      {/* Rotate Confirm */}
      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={(open) => { setRotateOpen(open); if (!open) setSelectedKey(null); }}
        title="Rotate API Key"
        description={`This will generate a new key for "${selectedKey?.name ?? ''}". The old key will stop working immediately.`}
        confirmLabel="Rotate"
        onConfirm={() => { if (selectedKey) rotateMutation.mutate(selectedKey.id); }}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setSelectedKey(null); }}
        title="Revoke API Key"
        description={`Are you sure you want to revoke "${selectedKey?.name ?? ''}"? Any integrations using this key will stop working.`}
        confirmLabel="Revoke"
        destructive
        onConfirm={() => { if (selectedKey) deleteMutation.mutate(selectedKey.id); }}
      />
    </>
  );
}

// --- Create Key Sheet ---
function CreateKeySheet({
  open, onOpenChange, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateForm) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { scopes: ['read'] },
  });

  const scopes = watch('scopes') ?? [];

  const toggleScope = (scope: string) => {
    const next = scopes.includes(scope)
      ? scopes.filter(s => s !== scope)
      : [...scopes, scope];
    setValue('scopes', next, { shouldValidate: true });
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create API Key</SheetTitle>
          <SheetDescription>Generate a key for programmatic access to the TWMail API.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div>
            <Label className="text-xs">Key Name</Label>
            <Input {...register('name')} placeholder="e.g. My Integration" className="mt-1" />
            {errors.name && <p className="text-xs text-status-danger mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label className="text-xs">Permissions</Label>
            <div className="mt-2 space-y-2">
              {SCOPE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-3 p-3 bg-surface rounded-lg cursor-pointer hover:bg-surface/80 transition-colors">
                  <Checkbox
                    checked={scopes.includes(opt.value)}
                    onCheckedChange={() => toggleScope(opt.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-medium text-text-primary">{opt.label}</div>
                    <div className="text-[10px] text-text-muted">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
            {errors.scopes && <p className="text-xs text-status-danger mt-1">{errors.scopes.message}</p>}
          </div>
          <SheetFooter>
            <Button type="submit" className="bg-tw-blue hover:bg-tw-blue-dark" size="sm" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Key'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// --- New Key Banner (shown once after creation/rotation) ---
function NewKeyBanner({ keyValue, onDismiss }: { keyValue: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg">
      <div className="bg-tw-black text-white rounded-2xl p-5 shadow-2xl border border-white/10">
        <h4 className="text-sm font-semibold mb-1">Your new API key</h4>
        <p className="text-[10px] text-white/50 mb-3">
          Copy it now — you won&apos;t be able to see it again.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/80 truncate">
            {keyValue}
          </code>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10" onClick={copyKey}>
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 text-xs" onClick={onDismiss}>
            I&apos;ve copied it
          </Button>
        </div>
      </div>
    </div>
  );
}
