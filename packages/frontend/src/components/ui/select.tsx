'use client';

import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectContextValue {
  value: string;
  label: string;
  onValueChange: (value: string, label: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue>({
  value: '',
  label: '',
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
});

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value: controlledValue, defaultValue = '', onValueChange, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [internalLabel, setInternalLabel] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const value = controlledValue ?? internalValue;

  const handleChange = React.useCallback(
    (v: string, lbl: string) => {
      setInternalValue(v);
      setInternalLabel(lbl);
      onValueChange?.(v);
      setOpen(false);
    },
    [onValueChange],
  );

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-select-root]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, label: internalLabel, onValueChange: handleChange, open, setOpen }}>
      <div className="relative" data-select-root>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({ className, children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(SelectContext);
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        'flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 h-8',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function SelectValue({ placeholder }: { placeholder?: string; className?: string }) {
  const ctx = React.useContext(SelectContext);
  return <span className="flex flex-1 text-left truncate">{ctx.label || ctx.value || placeholder}</span>;
}

function SelectContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(SelectContext);
  if (!ctx.open) return null;

  return (
    <div
      className={cn(
        'absolute z-50 mt-1 max-h-60 w-full min-w-36 overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 p-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SelectItem({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx.value === value;
  const ref = React.useRef<HTMLDivElement>(null);

  // Auto-set label when this item's value matches the controlled value on mount
  React.useEffect(() => {
    if (isSelected && ref.current) {
      const text = ref.current.textContent || '';
      if (text && !ctx.label) {
        ctx.onValueChange(value, text);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelected]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      onClick={() => ctx.onValueChange(value, ref.current?.textContent || value)}
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm select-none hover:bg-accent hover:text-accent-foreground',
        isSelected && 'bg-accent',
        className,
      )}
      {...props}
    >
      {children}
      {isSelected && (
        <span className="absolute right-2 flex size-4 items-center justify-center">
          <Check className="size-4" />
        </span>
      )}
    </div>
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
