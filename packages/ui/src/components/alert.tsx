import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        destructive: "border-destructive/25 bg-destructive/5 text-destructive",
        success: "border-success/20 bg-success/5 text-success",
        warning: "border-warning/25 bg-warning/5 text-warning-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Alert({
  className,
  variant,
  role = "alert",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
export function AlertTitle({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="alert-title" className={cn("font-medium", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("mt-1 text-sm leading-relaxed opacity-85", className)}
      {...props}
    />
  );
}
