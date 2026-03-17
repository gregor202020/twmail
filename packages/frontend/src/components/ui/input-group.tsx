import * as React from "react";
import { cn } from "@/lib/utils";

function InputGroup({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors", className)} {...props}>
      {children}
    </div>
  );
}

function InputGroupAddon({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-center px-2 text-sm text-muted-foreground", className)} {...props}>
      {children}
    </div>
  );
}

export { InputGroup, InputGroupAddon };
