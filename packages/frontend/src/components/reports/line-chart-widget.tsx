'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LineChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<Record<string, unknown>>;
  lines: Array<{ dataKey: string; color: string; dashed?: boolean }>;
  xDataKey: string;
  height?: number;
}

export function LineChartWidget({ title, subtitle, data, lines, xDataKey, height = 200 }: LineChartWidgetProps) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <div className="flex items-center gap-3">
          {lines.map(l => (
            <span key={l.dataKey} className="flex items-center gap-1 text-[10px]" style={{ color: l.color }}>
              <span className="w-2 h-[3px] rounded-full inline-block" style={{ background: l.color }} />
              {l.dataKey}
            </span>
          ))}
          {subtitle && <span className="text-[11px] text-text-muted">{subtitle}</span>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <XAxis dataKey={xDataKey} tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e8e8' }} />
          {lines.map(l => (
            <Line
              key={l.dataKey}
              type="monotone"
              dataKey={l.dataKey}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? '4 3' : undefined}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
