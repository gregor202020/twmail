'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import { EventType } from '@twmail/shared/types';
import type { Event } from '@/types';

const EVENT_CONFIG: Record<number, { label: string; color: string }> = {
  [EventType.SENT]: { label: 'Email Sent', color: 'bg-blue-400' },
  [EventType.DELIVERED]: { label: 'Delivered', color: 'bg-green-400' },
  [EventType.OPEN]: { label: 'Opened', color: 'bg-emerald-500' },
  [EventType.CLICK]: { label: 'Clicked', color: 'bg-tw-blue' },
  [EventType.HARD_BOUNCE]: { label: 'Hard Bounce', color: 'bg-red-500' },
  [EventType.SOFT_BOUNCE]: { label: 'Soft Bounce', color: 'bg-orange-400' },
  [EventType.COMPLAINT]: { label: 'Complaint', color: 'bg-red-600' },
  [EventType.UNSUBSCRIBE]: { label: 'Unsubscribed', color: 'bg-gray-500' },
  [EventType.MACHINE_OPEN]: { label: 'Machine Open', color: 'bg-gray-400' },
};

interface ActivityTimelineProps {
  contactId: number;
}

export function ActivityTimeline({ contactId }: ActivityTimelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.contacts.timeline(contactId),
    queryFn: () =>
      api.get<{ data: Event[] }>(`/contacts/${contactId}/timeline`).then((r) => r.data),
  });

  if (isLoading) return <TableSkeleton rows={4} cols={2} />;

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <p className="text-xs text-text-muted py-8 text-center">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-card-border" />

      <div className="space-y-4">
        {events.map((event) => {
          const config = EVENT_CONFIG[event.event_type] ?? {
            label: `Event ${event.event_type}`,
            color: 'bg-gray-400',
          };
          return (
            <div key={event.id} className="relative flex items-start gap-3 pl-0">
              {/* Dot */}
              <div
                className={`relative z-10 mt-1 w-[15px] h-[15px] rounded-full border-2 border-white ${config.color} shrink-0`}
              />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary">{config.label}</p>
                {event.metadata && (event.metadata as Record<string, string>).campaign_name && (
                  <p className="text-[11px] text-text-muted truncate">
                    {(event.metadata as Record<string, string>).campaign_name}
                  </p>
                )}
                <p className="text-[10px] text-text-muted mt-0.5">
                  {formatDateTime(event.event_time)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
