'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Upload, Trash2, List as ListIcon } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, timeAgo } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddContactDrawer } from '@/components/contacts/add-contact-drawer';
import type { Contact, List, PaginationMeta } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ContactsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const { page, perPage, goToPage } = usePagination(1, 50);
  const queryClient = useQueryClient();

  // Fetch lists
  const { data: listsData } = useQuery({
    queryKey: queryKeys.lists.list(),
    queryFn: () => api.get<{ data: List[] }>('/lists'),
  });
  const lists = listsData?.data ?? [];

  // Fetch contacts (all or filtered by list)
  const { data, isLoading } = useQuery({
    queryKey: activeListId
      ? ['contacts', 'by-list', activeListId, page]
      : queryKeys.contacts.list({ page }),
    queryFn: () =>
      activeListId
        ? api.get<{ data: Contact[]; pagination: PaginationMeta }>(
            `/lists/${activeListId}/contacts?page=${page}&per_page=${perPage}`
          ).then((r) => ({ data: r.data, meta: r.pagination }))
        : api.get<{ data: Contact[]; meta: PaginationMeta }>(
            `/contacts?page=${page}&per_page=${perPage}`
          ),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => api.delete(`/contacts/${id}`))),
    onSuccess: () => {
      toast.success('Contacts deleted');
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
    onError: () => {
      toast.error('Failed to delete contacts');
    },
  });

  const contacts = data?.data ?? [];
  const total = data?.meta?.total ?? (data as { pagination?: PaginationMeta })?.pagination?.total ?? 0;

  const columns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (c) => (
        <Link
          href={`/contacts/${c.id}`}
          className="text-xs font-medium text-text-primary hover:text-tw-blue transition-colors"
        >
          {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
        </Link>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (c) => (
        <span className="text-xs text-text-secondary">{c.email}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge type="contact" status={c.status} />,
    },
    {
      key: 'lists',
      header: 'Lists',
      render: (c) => {
        const count = (c as Contact & { list_count?: number }).list_count ?? 0;
        return count > 0 ? (
          <Badge variant="secondary">{count}</Badge>
        ) : (
          <span className="text-xs text-text-muted">--</span>
        );
      },
    },
    {
      key: 'last_activity',
      header: 'Last Activity',
      render: (c) => (
        <span className="text-xs text-text-muted">
          {c.last_activity_at ? timeAgo(c.last_activity_at) : '--'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (c) => (
        <span className="text-xs text-text-muted">{formatDate(c.created_at)}</span>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <div className="flex items-center gap-2">
            <Link href="/contacts/import">
              <Button variant="outline" size="sm">
                <Upload className="w-3.5 h-3.5" />
                Import
              </Button>
            </Link>
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={() => setDrawerOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Contact
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex gap-6">
            {/* Lists sidebar */}
            <div className="w-[200px] shrink-0">
              <h3 className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2 px-2">Lists</h3>
              <div className="space-y-0.5">
                <button
                  onClick={() => { setActiveListId(null); goToPage(1); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left',
                    activeListId === null
                      ? 'bg-tw-blue-light text-tw-blue font-medium'
                      : 'text-text-secondary hover:bg-surface'
                  )}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">All Contacts</span>
                </button>
                {lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => { setActiveListId(list.id); goToPage(1); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left',
                      activeListId === list.id
                        ? 'bg-tw-blue-light text-tw-blue font-medium'
                        : 'text-text-secondary hover:bg-surface'
                    )}
                  >
                    <ListIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1">{list.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contacts table */}
            <div className="flex-1 min-w-0">
              {!isLoading && contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-4">
                    <Users className="w-6 h-6 text-text-muted" />
                  </div>
                  <h3 className="text-sm font-medium text-text-primary mb-1">
                    {activeListId ? 'No contacts in this list' : 'No contacts yet'}
                  </h3>
                  <p className="text-xs text-text-muted max-w-sm">
                    {activeListId
                      ? 'Import contacts or add them to this list.'
                      : 'Add your first contact or import a list to get started.'}
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <Button onClick={() => setDrawerOpen(true)} className="bg-tw-blue hover:bg-tw-blue-dark" size="sm">
                      Add Contact
                    </Button>
                    <Link href="/contacts/import">
                      <Button variant="outline" size="sm">
                        <Upload className="w-3.5 h-3.5" />
                        Import
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={contacts}
                  total={total}
                  page={page}
                  perPage={perPage}
                  onPageChange={goToPage}
                  isLoading={isLoading}
                  selectable
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  getId={(c) => c.id}
                  bulkActions={
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => deleteMutation.mutate([...selectedIds])}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <AddContactDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
