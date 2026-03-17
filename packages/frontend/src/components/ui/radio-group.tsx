"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface RadioGroupContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({
  value: "",
  onValueChange: () => {},
});

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

function RadioGroup({ value: controlledValue, defaultValue = "", onValueChange, className, children, ...props }: RadioGroupProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const value = controlledValue ?? internalValue;

  const handleChange = React.useCallback((v: string) => {
    setInternalValue(v);
    onValueChange?.(v);
  }, [onValueChange]);

  return (
    <RadioGroupContext.Provider value={{ value, onValueChange: handleChange }}>
      <div role="radiogroup" className={cn("grid w-full gap-2", className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

interface RadioGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function RadioGroupItem({ value, className, ...props }: RadioGroupItemProps) {
  const ctx = React.useContext(RadioGroupContext);
  const isChecked = ctx.value === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isChecked}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        isChecked && "border-primary bg-primary",
        className,
      )}
      {...props}
    >
      {isChecked && (
        <span className="flex size-full items-center justify-center">
          <span className="size-2 rounded-full bg-primary-foreground" />
        </span>
      )}
    </button>
  );
}

export { RadioGroup, RadioGroupItem };
