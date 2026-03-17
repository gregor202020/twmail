import * as React from "react";
import { cn } from "@/lib/utils";

function Avatar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)} {...props}>
      {children}
    </div>
  );
}

function AvatarImage({ className, src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img src={src} alt={alt} className={cn("aspect-square size-full rounded-full object-cover", className)} {...props} />;
}

function AvatarFallback({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground", className)} {...props}>
      {children}
    </div>
  );
}

export { Avatar, AvatarImage, AvatarFallback };
