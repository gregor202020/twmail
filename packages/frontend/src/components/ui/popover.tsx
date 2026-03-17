"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Popover({ children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <div className="relative inline-block">{children}</div>;
}

function PopoverTrigger({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}>{children}</button>;
}

function PopoverContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("absolute z-50 mt-1 w-72 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10", className)} {...props}>
      {children}
    </div>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
