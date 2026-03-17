'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
}

function DialogContent({ className, children, showCloseButton = true, ...props }: React.HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const dialogCtx = React.useContext(DialogCloseContext);

  return (
    <div
      ref={parentRef}
      className={cn(
        'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-background p-4 text-sm ring-1 ring-foreground/10 sm:max-w-sm',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <button
          type="button"
          onClick={() => dialogCtx?.()}
          className="absolute top-3 right-3 p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
    </div>
  );
}

const DialogCloseContext = React.createContext<(() => void) | null>(null);

function DialogWrapper({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <DialogCloseContext.Provider value={() => onOpenChange?.(false)}>
      <div className="fixed inset-0 z-50">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => onOpenChange?.(false)} />
        {children}
      </div>
    </DialogCloseContext.Provider>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base leading-none font-medium', className)} {...props}>{children}</h2>;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export {
  DialogWrapper as Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
