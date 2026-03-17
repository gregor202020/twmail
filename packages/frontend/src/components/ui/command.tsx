"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

function Command({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground", className)} {...props}>
      {children}
    </div>
  );
}

function CommandInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1">
      <Search className="size-4 text-muted-foreground shrink-0" />
      <Input className={cn("border-0 bg-transparent shadow-none focus-visible:ring-0 h-8", className)} {...props} />
    </div>
  );
}

function CommandEmpty({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("py-6 text-center text-sm", className)} {...props}>{children}</div>;
}

function CommandGroup({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden p-1 text-foreground", className)} {...props}>{children}</div>;
}

function CommandItem({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted select-none", className)} {...props}>
      {children}
    </div>
  );
}

export { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem };
