"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Controller, FormProvider, useFormContext } from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/* -------------------- FORM PROVIDER -------------------- */
const Form = FormProvider

/* -------------------- FIELD CONTEXT -------------------- */
const FormFieldContext = React.createContext(null)
const FormItemContext = React.createContext(null)

/* -------------------- FORM FIELD -------------------- */
const FormField = ({ ...props }) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

/* -------------------- USE FORM FIELD -------------------- */
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  if (!fieldContext) {
    throw new Error("useFormField must be used within <FormField>")
  }

  const fieldState = getFieldState(fieldContext.name, formState)
  const id = itemContext?.id

  return {
    id,
    name: fieldContext.name,
    formItemId: id ? `${id}-form-item` : undefined,
    formDescriptionId: id ? `${id}-form-item-description` : undefined,
    formMessageId: id ? `${id}-form-item-message` : undefined,
    ...fieldState,
  }
}

/* -------------------- FORM ITEM -------------------- */
const FormItem = React.forwardRef(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

/* -------------------- LABEL -------------------- */
const FormLabel = React.forwardRef(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    <Label
      ref={ref}
      htmlFor={formItemId}
      className={cn(error && "text-destructive", className)}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

/* -------------------- CONTROL -------------------- */
const FormControl = React.forwardRef(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-invalid={!!error}
      aria-describedby={
        error
          ? `${formDescriptionId} ${formMessageId}`
          : formDescriptionId
      }
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

/* -------------------- DESCRIPTION -------------------- */
const FormDescription = React.forwardRef(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-[0.8rem] text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

/* -------------------- MESSAGE -------------------- */
const FormMessage = React.forwardRef(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()

  const body = error ? String(error?.message) : children
  if (!body) return null

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-[0.8rem] font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

/* -------------------- EXPORTS -------------------- */
export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
}