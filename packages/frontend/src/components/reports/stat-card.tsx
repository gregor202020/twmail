import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  variant?: 'default' | 'blue-gradient';
  subtitle?: string;
}

export function StatCard({ label, value, trend, trendUp, variant = 'default', subtitle }: StatCardProps) {
  if (variant === 'blue-gradient') {
    return (
      <div className="bg-gradient-to-br from-tw-blue to-tw-blue-dark rounded-[14px] p-5 text-white relative overflow-hidden">
        <div className="absolute right-[-20px] top-[-20px] w-20 h-20 bg-white/10 rounded-full" />
        <div className="text-[10px] uppercase tracking-[1px] opacity-70">{label}</div>
        <div className="text-[32px] font-bold mt-1 tracking-tight">{value}</div>
        {subtitle && <div className="text-[11px] opacity-70 mt-1">{subtitle}</div>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="text-[10px] uppercase tracking-[1px] text-text-muted">{label}</div>
      <div className="text-[26px] font-bold text-text-primary mt-1 tracking-tight">{value}</div>
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          <div className={cn('w-1.5 h-1.5 rounded-full', trendUp ? 'bg-status-success' : 'bg-status-danger')} />
          <span className={cn('text-[11px]', trendUp ? 'text-status-success' : 'text-status-danger')}>{trend}</span>
        </div>
      )}
    </div>
  );
}
