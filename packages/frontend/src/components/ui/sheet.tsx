'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const sideClasses: Record<string, string> = {
    right: 'inset-y-0 right-0 h-full w-3/4 sm:max-w-sm border-l',
    left: 'inset-y-0 left-0 h-full w-3/4 sm:max-w-sm border-r',
    top: 'inset-x-0 top-0 h-auto border-b',
    bottom: 'inset-x-0 bottom-0 h-auto border-t',
  };

  return (
    <div
      className={cn('fixed z-50 flex flex-col gap-4 bg-background p-4 shadow-lg', sideClasses[side], className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-0.5', className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto flex flex-col gap-2', className)} {...props} />;
}

function SheetTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-medium text-foreground', className)} {...props}>{children}</h2>;
}

function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };
