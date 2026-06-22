"use client";

import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/* ---------------- ROOT ---------------- */

const NavigationMenu = React.forwardRef(function NavigationMenu(
  { className, children, ...props },
  ref
) {
  return (
    <NavigationMenuPrimitive.Root
      ref={ref}
      className={cn(
        "relative z-10 flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      <NavigationMenuViewport />
    </NavigationMenuPrimitive.Root>
  );
});

NavigationMenu.displayName = "NavigationMenu";

/* ---------------- LIST ---------------- */

const NavigationMenuList = React.forwardRef(function NavigationMenuList(
  { className, ...props },
  ref
) {
  return (
    <NavigationMenuPrimitive.List
      ref={ref}
      className={cn(
        "group flex flex-1 list-none items-center justify-center space-x-1",
        className
      )}
      {...props}
    />
  );
});

NavigationMenuList.displayName = "NavigationMenuList";

/* ---------------- ITEM ---------------- */

const NavigationMenuItem = NavigationMenuPrimitive.Item;

/* ---------------- TRIGGER STYLE ---------------- */

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50"
);

/* ---------------- TRIGGER ---------------- */

const NavigationMenuTrigger = React.forwardRef(function NavigationMenuTrigger(
  { className, children, ...props },
  ref
) {
  return (
    <NavigationMenuPrimitive.Trigger
      ref={ref}
      className={cn(
        navigationMenuTriggerStyle(),
        "group",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className="relative top-[1px] ml-1 h-3 w-3 transition-transform duration-300 group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
});

NavigationMenuTrigger.displayName = "NavigationMenuTrigger";

/* ---------------- CONTENT ---------------- */

const NavigationMenuContent = React.forwardRef(function NavigationMenuContent(
  { className, ...props },
  ref
) {
  return (
    <NavigationMenuPrimitive.Content
      ref={ref}
      className={cn(
        "left-0 top-0 w-full md:absolute md:w-auto",
        "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out",
        "data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52",
        "data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52",
        className
      )}
      {...props}
    />
  );
});

NavigationMenuContent.displayName = "NavigationMenuContent";

/* ---------------- LINK ---------------- */

const NavigationMenuLink = NavigationMenuPrimitive.Link;

/* ---------------- VIEWPORT ---------------- */

const NavigationMenuViewport = React.forwardRef(function NavigationMenuViewport(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full flex justify-center"
    >
      <NavigationMenuPrimitive.Viewport
        className={cn(
          "origin-top-center relative mt-1.5",
          "h-[var(--radix-navigation-menu-viewport-height)]",
          "w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90",
          "md:w-[var(--radix-navigation-menu-viewport-width)]",
          className
        )}
        {...props}
      />
    </div>
  );
});

NavigationMenuViewport.displayName = "NavigationMenuViewport";

/* ---------------- INDICATOR ---------------- */

const NavigationMenuIndicator = React.forwardRef(function NavigationMenuIndicator(
  { className, ...props },
  ref
) {
  return (
    <NavigationMenuPrimitive.Indicator
      ref={ref}
      className={cn(
        "top-full z-[1] flex h-1.5 items-end justify-center",
        "data-[state=visible]:animate-in data-[state=hidden]:animate-out",
        "data-[state=hidden]:fade-out data-[state=visible]:fade-in",
        className
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
});

NavigationMenuIndicator.displayName = "NavigationMenuIndicator";

/* ---------------- EXPORTS ---------------- */

export {
  navigationMenuTriggerStyle,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
};