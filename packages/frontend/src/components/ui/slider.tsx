"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  className?: string;
}

function Slider({ value, defaultValue = [50], min = 0, max = 100, step = 1, onValueChange, className }: SliderProps) {
  const currentValue = value ?? defaultValue;
  return (
    <div className={cn("relative w-full", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue[0]}
        onChange={(e) => onValueChange?.([Number(e.target.value)])}
        className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

export { Slider };
