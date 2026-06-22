import * as React from "react";
import { cn } from "@/lib/utils";

const Skeleton = React.forwardRef(function Skeleton(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-primary/10",
        className
      )}
      {...props}
    />
  );
});

Skeleton.displayName = "Skeleton";

export { Skeleton };