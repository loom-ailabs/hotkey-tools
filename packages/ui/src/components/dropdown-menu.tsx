"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuSub = Menu.Sub;

const surface =
  "z-50 min-w-40 overflow-hidden rounded-lg border bg-card p-1 text-card-foreground shadow-xl outline-none";
const item =
  "relative flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        className={cn(surface, "max-h-96 overflow-y-auto", className)}
        sideOffset={sideOffset}
        {...props}
      />
    </Menu.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(item, className)} {...props} />;
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={cn(item, "data-[state=open]:bg-accent", className)} {...props}>
      {children}
      <span aria-hidden="true" className="ml-auto text-muted-foreground">
        ›
      </span>
    </Menu.SubTrigger>
  );
}
export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent className={cn(surface, className)} {...props} />
    </Menu.Portal>
  );
}
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(item, "pl-8", className)} {...props}>
      <span className="absolute left-3 flex size-3 items-center justify-center">
        <Menu.ItemIndicator>
          <span className="block size-1.5 rounded-full bg-current" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}
