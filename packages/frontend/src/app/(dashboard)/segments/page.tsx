'use client';
import { useQuery } from '@tanstack/react-query';
import { Filter, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, formatNumber } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import type { Segment, SegmentRuleGroup, SegmentRule } from '@/types';

function summarizeRules(rules: SegmentRuleGroup[]): string {
  if (!rules || rules.length === 0) return 'No rules';
  const count = rules.reduce(
    (acc, g) => acc + (g.rules as SegmentRule[]).length,
    0
  );
  return `${count} rule${count !== 1 ? 's' : ''} in ${rules.length} group${rules.length !== 1 ? 's' : ''}`;
}

export default function SegmentsPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.segments.list(),
    queryFn: () =>
      api.get<{ data: Segment[] }>('/segments'),
  });

  const segments = data?.data ?? [];

  const columns: Column<Segment>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <Link
          href={`/segments/${s.id}`}
          className="text-xs font-medium text-text-primary hover:text-tw-blue transition-colors"
        >
          {s.name}
        </Link>
      ),
    },
    {
      key: 'contact_count',
      header: 'Contacts',
      render: (s) => (
        <span className="text-xs text-text-secondary">
          {formatNumber((s as Segment & { contact_count?: number }).contact_count ?? 0)}
        </span>
      ),
    },
    {
      key: 'rules',
      header: 'Rules',
      render: (s) => (
        <span className="text-xs text-text-muted">
          {summarizeRules((s as Segment & { rules?: SegmentRuleGroup[] }).rules ?? [])}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (s) => (
        <span className="text-xs text-text-muted">{formatDate(s.created_at)}</span>
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
            onClick={() => router.push('/segments/new/edit')}
          >
            <Plus className="w-3.5 h-3.5" />
            New Segment
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          {!isLoading && segments.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="No segments yet"
              description="Create segments to group contacts by rules and conditions."
              actionLabel="New Segment"
              onAction={() => router.push('/segments/new/edit')}
            />
          ) : (
            <DataTable
              columns={columns}
              data={segments}
              total={segments.length}
              page={1}
              perPage={100}
              onPageChange={() => {}}
              isLoading={isLoading}
              getId={(s) => s.id}
            />
          )}
        </div>
      </div>
    </>
  );
}
