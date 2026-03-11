import { cn } from '@/lib/utils';
import { CAMPAIGN_STATUS_CONFIG, CONTACT_STATUS_CONFIG } from '@/lib/constants';

interface StatusBadgeProps {
  type: 'campaign' | 'contact';
  status: number;
}

export function StatusBadge({ type, status }: StatusBadgeProps) {
  const config = type === 'campaign'
    ? CAMPAIGN_STATUS_CONFIG[status]
    : CONTACT_STATUS_CONFIG[status];
  if (!config) return null;
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium', config.color)}>
      {config.label}
    </span>
  );
}

interface StatusDotProps {
  status: number;
  className?: string;
}

export function CampaignStatusDot({ status, className }: StatusDotProps) {
  const config = CAMPAIGN_STATUS_CONFIG[status];
  if (!config) return null;
  return <div className={cn('w-2 h-2 rounded-full', config.dotClass, className)} />;
}
