"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

const DEFAULT_CONTEXT = {
  size: "default",
  variant: "default",
};

const ToggleGroupContext = React.createContext(DEFAULT_CONTEXT);

const ToggleGroup = React.forwardRef(function ToggleGroup(
  { className, variant, size, children, ...props },
  ref
) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn("flex items-center justify-center gap-1", className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
});

ToggleGroup.displayName = "ToggleGroup";

const ToggleGroupItem = React.forwardRef(function ToggleGroupItem(
  { className, variant, size, children, ...props },
  ref
) {
  const context = React.useContext(ToggleGroupContext);

  const resolvedVariant = variant ?? context.variant;
  const resolvedSize = size ?? context.size;

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleVariants({
          variant: resolvedVariant,
          size: resolvedSize,
        }),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
});

ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };