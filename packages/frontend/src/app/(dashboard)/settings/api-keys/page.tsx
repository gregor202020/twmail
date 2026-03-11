'use client';
import { Info, Plus } from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';

interface ApiKeyRow {
  id: number;
  name: string;
  key: string;
  scopes: string;
  created_at: string;
}

const columns: Column<ApiKeyRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (k) => (
      <span className="text-xs font-medium text-text-primary">{k.name}</span>
    ),
  },
  {
    key: 'key',
    header: 'Key',
    render: (k) => (
      <span className="text-xs text-text-muted font-mono">{k.key}</span>
    ),
  },
  {
    key: 'scopes',
    header: 'Scopes',
    render: (k) => (
      <span className="text-xs text-text-secondary">{k.scopes}</span>
    ),
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (k) => (
      <span className="text-xs text-text-muted">{k.created_at}</span>
    ),
  },
];

export default function ApiKeysPage() {
  return (
    <>
      <TopBar
        action={
          <Button
            className="bg-tw-blue hover:bg-tw-blue-dark opacity-50 cursor-not-allowed"
            size="sm"
            disabled
          >
            <Plus className="w-3.5 h-3.5" />
            Create API Key
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="flex items-start gap-3 p-4 bg-tw-blue-light border border-tw-blue/20 rounded-xl">
            <Info className="w-5 h-5 text-tw-blue shrink-0 mt-0.5" />
            <div className="text-xs text-tw-blue">
              <strong>API key management</strong> &mdash; coming soon.
              You&apos;ll be able to create and manage API keys for programmatic access.
            </div>
          </div>

          <DataTable
            columns={columns}
            data={[]}
            total={0}
            page={1}
            perPage={50}
            onPageChange={() => {}}
          />
        </div>
      </div>
    </>
  );
}
