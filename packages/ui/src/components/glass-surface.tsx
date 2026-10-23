import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export type GlassSurfaceProps = ComponentProps<"div"> & {
  intensity?: "subtle" | "raised";
};

export function GlassSurface({ intensity = "subtle", className, ...props }: GlassSurfaceProps) {
  return (
    <div
      data-slot="glass-surface"
      className={cn(
        "rounded-xl",
        intensity === "raised" ? "loom-glass-strong" : "loom-glass",
        className,
      )}
      {...props}
    />
  );
}
