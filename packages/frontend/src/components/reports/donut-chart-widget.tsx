'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DonutChartWidgetProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
}

export function DonutChartWidget({ title, data }: DonutChartWidgetProps) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <span className="text-sm font-semibold text-text-primary">{title}</span>
      <div className="flex items-center gap-6 mt-4">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
              <span className="text-xs text-text-secondary">{d.name}</span>
              <span className="text-xs font-medium text-text-primary">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
