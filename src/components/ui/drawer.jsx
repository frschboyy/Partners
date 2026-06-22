"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

/* -------------------- ROOT -------------------- */
const Drawer = ({
  shouldScaleBackground = true,
  ...props
}) => {
  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      {...props}
    />
  )
}

Drawer.displayName = "Drawer"

/* -------------------- PRIMITIVES -------------------- */
const DrawerTrigger = DrawerPrimitive.Trigger
const DrawerPortal = DrawerPrimitive.Portal
const DrawerClose = DrawerPrimitive.Close

/* -------------------- OVERLAY -------------------- */
const DrawerOverlay = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <DrawerPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  )
})

DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

/* -------------------- CONTENT -------------------- */
const DrawerContent = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    return (
      <DrawerPortal>
        <DrawerOverlay />

        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
            "shadow-lg",
            className
          )}
          {...props}
        >
          {/* handle */}
          <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
          {children}
        </DrawerPrimitive.Content>
      </DrawerPortal>
    )
  }
)

DrawerContent.displayName = "DrawerContent"

/* -------------------- HEADER -------------------- */
const DrawerHeader = ({ className, ...props }) => {
  return (
    <div
      className={cn(
        "grid gap-1.5 p-4 text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}

DrawerHeader.displayName = "DrawerHeader"

/* -------------------- FOOTER -------------------- */
const DrawerFooter = ({ className, ...props }) => {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col gap-2 p-4",
        className
      )}
      {...props}
    />
  )
}

DrawerFooter.displayName = "DrawerFooter"

/* -------------------- TITLE -------------------- */
const DrawerTitle = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <DrawerPrimitive.Title
      ref={ref}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
})

DrawerTitle.displayName = DrawerPrimitive.Title.displayName

/* -------------------- DESCRIPTION -------------------- */
const DrawerDescription = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <DrawerPrimitive.Description
      ref={ref}
      className={cn(
        "text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
})

DrawerDescription.displayName =
  DrawerPrimitive.Description.displayName

/* -------------------- EXPORTS -------------------- */
export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}