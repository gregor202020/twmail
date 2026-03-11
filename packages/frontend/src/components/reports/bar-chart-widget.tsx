'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BarChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; value: number }>;
  highlightMax?: boolean;
}

export function BarChartWidget({ title, subtitle, data, highlightMax = true }: BarChartWidgetProps) {
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        {subtitle && <span className="text-[11px] text-text-muted">{subtitle}</span>}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e8e8' }}
            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={highlightMax && entry.value === maxValue ? '#C41E2A' : '#0170B9'}
                fillOpacity={highlightMax && entry.value === maxValue ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
