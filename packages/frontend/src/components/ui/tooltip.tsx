"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function TooltipProvider({ children }: { children: React.ReactNode; delay?: number }) {
  return <>{children}</>;
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TooltipTrigger({
  className,
  children,
  render,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { render?: React.ReactElement }) {
  if (render) {
    return React.cloneElement(
      render,
      { className: cn((render.props as Record<string, unknown>).className as string, className), ...props } as Record<string, unknown>,
      children,
    );
  }
  return <div className={cn(className)} {...props}>{children}</div>;
}

function TooltipContent({ children, side, className }: { children: React.ReactNode; side?: string; className?: string }) {
  return null;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
