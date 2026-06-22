"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

/* ---------------- PANEL GROUP ---------------- */

const ResizablePanelGroup = React.forwardRef(function ResizablePanelGroup(
  { className, ...props },
  ref
) {
  return (
    <ResizablePrimitive.PanelGroup
      ref={ref}
      className={cn(
        "flex h-full w-full",
        "data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  );
});

ResizablePanelGroup.displayName = "ResizablePanelGroup";

/* ---------------- PANEL ---------------- */

const ResizablePanel = React.forwardRef(function ResizablePanel(
  props,
  ref
) {
  return <ResizablePrimitive.Panel ref={ref} {...props} />;
});

ResizablePanel.displayName = "ResizablePanel";

/* ---------------- HANDLE ---------------- */

const ResizableHandle = React.forwardRef(function ResizableHandle(
  { withHandle, className, ...props },
  ref
) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      ref={ref}
      role="separator"
      aria-orientation="horizontal"
      className={cn(
        "relative flex w-px items-center justify-center bg-border",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        "data-[panel-group-direction=vertical]:h-px",
        "data-[panel-group-direction=vertical]:w-full",
        "data-[panel-group-direction=vertical]:after:left-0",
        "data-[panel-group-direction=vertical]:after:h-1",
        "data-[panel-group-direction=vertical]:after:w-full",
        "data-[panel-group-direction=vertical]:after:-translate-y-1/2",
        "data-[panel-group-direction=vertical]:after:translate-x-0",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "z-10 flex h-4 w-3 items-center justify-center",
            "rounded-sm border bg-border"
          )}
        >
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
});

ResizableHandle.displayName = "ResizableHandle";

/* ---------------- EXPORTS ---------------- */

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
};