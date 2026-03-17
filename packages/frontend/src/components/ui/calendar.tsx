"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CalendarProps {
  className?: string;
  selected?: Date;
  onSelect?: (date: Date) => void;
}

function Calendar({ className, selected, onSelect }: CalendarProps) {
  const [month, setMonth] = React.useState(() => selected ?? new Date());
  const year = month.getFullYear();
  const m = month.getMonth();

  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthName = month.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setMonth(new Date(year, m - 1, 1))} className="p-1 hover:bg-muted rounded text-sm">&lt;</button>
        <span className="text-sm font-medium">{monthName}</span>
        <button type="button" onClick={() => setMonth(new Date(year, m + 1, 1))} className="p-1 hover:bg-muted rounded text-sm">&gt;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => (
          <button
            key={i}
            type="button"
            disabled={day === null}
            onClick={() => day && onSelect?.(new Date(year, m, day))}
            className={cn(
              "h-7 w-7 text-xs rounded-md flex items-center justify-center",
              day === null && "invisible",
              day !== null && "hover:bg-muted cursor-pointer",
              selected && day === selected.getDate() && m === selected.getMonth() && year === selected.getFullYear() && "bg-primary text-primary-foreground",
            )}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );
}

export { Calendar };
