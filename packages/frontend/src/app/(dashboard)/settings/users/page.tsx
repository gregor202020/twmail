'use client';
import { Info, Plus } from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  last_active: string;
}

const columns: Column<UserRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (u) => (
      <span className="text-xs font-medium text-text-primary">{u.name}</span>
    ),
  },
  {
    key: 'email',
    header: 'Email',
    render: (u) => (
      <span className="text-xs text-text-secondary">{u.email}</span>
    ),
  },
  {
    key: 'role',
    header: 'Role',
    render: (u) => (
      <span className="text-xs text-text-secondary">{u.role}</span>
    ),
  },
  {
    key: 'last_active',
    header: 'Last Active',
    render: (u) => (
      <span className="text-xs text-text-muted">{u.last_active}</span>
    ),
  },
];

export default function UsersPage() {
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
            Invite User
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="flex items-start gap-3 p-4 bg-tw-blue-light border border-tw-blue/20 rounded-xl">
            <Info className="w-5 h-5 text-tw-blue shrink-0 mt-0.5" />
            <div className="text-xs text-tw-blue">
              <strong>User management</strong> &mdash; coming soon.
              You&apos;ll be able to invite team members and manage roles.
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
