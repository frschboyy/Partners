"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/* ---------------- ROOT INPUT ---------------- */

const InputOTP = React.forwardRef(function InputOTP(
  { className, containerClassName, ...props },
  ref
) {
  return (
    <OTPInput
      ref={ref}
      containerClassName={cn(
        "flex items-center gap-2 has-[:disabled]:opacity-50",
        containerClassName
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
});

InputOTP.displayName = "InputOTP";

/* ---------------- GROUP ---------------- */

const InputOTPGroup = React.forwardRef(function InputOTPGroup(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center", className)}
      {...props}
    />
  );
});

InputOTPGroup.displayName = "InputOTPGroup";

/* ---------------- SLOT ---------------- */

const InputOTPSlot = React.forwardRef(function InputOTPSlot(
  { index, className, ...props },
  ref
) {
  const context = React.useContext(OTPInputContext);

  const slot = context?.slots?.[index];

  const char = slot?.char ?? "";
  const hasFakeCaret = slot?.hasFakeCaret;
  const isActive = slot?.isActive;

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all",
        "first:rounded-l-md first:border-l last:rounded-r-md",
        isActive && "z-10 ring-1 ring-ring",
        className
      )}
      {...props}
    >
      {char}

      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
});

InputOTPSlot.displayName = "InputOTPSlot";

/* ---------------- SEPARATOR ---------------- */

const InputOTPSeparator = React.forwardRef(function InputOTPSeparator(
  props,
  ref
) {
  return (
    <div ref={ref} role="separator" {...props}>
      <Minus className="h-4 w-4" />
    </div>
  );
});

InputOTPSeparator.displayName = "InputOTPSeparator";

/* ---------------- EXPORTS ---------------- */

export {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
};