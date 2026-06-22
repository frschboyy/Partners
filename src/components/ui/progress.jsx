"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

/* ---------------- PROGRESS ---------------- */

const Progress = React.forwardRef(function Progress(
  { className, value = 0, ...props },
  ref
) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      value={safeValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-transform"
        style={{
          transform: `translateX(-${100 - safeValue}%)`,
        }}
      />
    </ProgressPrimitive.Root>
  );
});

Progress.displayName = "Progress";

export { Progress };