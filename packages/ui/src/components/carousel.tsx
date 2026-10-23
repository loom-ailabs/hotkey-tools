"use client";

import * as React from "react";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { cn } from "../lib/utils";

// Adapted from the official shadcn/ui Carousel composition, with app-owned controls.
export type CarouselApi = UseEmblaCarouselType[1];
type CarouselProps = {
  opts?: Parameters<typeof useEmblaCarousel>[0];
  plugins?: Parameters<typeof useEmblaCarousel>[1];
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};
type CarouselContextValue = {
  viewportRef: UseEmblaCarouselType[0];
  orientation: "horizontal" | "vertical";
};
const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const value = React.useContext(CarouselContext);
  if (!value) throw new Error("Carousel content must be inside Carousel");
  return value;
}

export function Carousel({
  orientation = "horizontal",
  opts,
  plugins,
  setApi,
  className,
  onKeyDownCapture,
  ...props
}: React.ComponentProps<"div"> & CarouselProps) {
  const [viewportRef, api] = useEmblaCarousel(
    { ...opts, axis: orientation === "horizontal" ? "x" : "y" },
    plugins,
  );
  React.useEffect(() => {
    if (api) setApi?.(api);
  }, [api, setApi]);
  return (
    <CarouselContext.Provider value={{ viewportRef, orientation }}>
      <div
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        className={cn("relative", className)}
        onKeyDownCapture={(event) => {
          onKeyDownCapture?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            api?.scrollPrev();
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            api?.scrollNext();
          }
        }}
        {...props}
      />
    </CarouselContext.Provider>
  );
}

export function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
  const { viewportRef, orientation } = useCarousel();
  return (
    <div ref={viewportRef} className="overflow-hidden" data-slot="carousel-content">
      <div
        className={cn("flex", orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col", className)}
        {...props}
      />
    </div>
  );
}

export function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
  const { orientation } = useCarousel();
  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className,
      )}
      {...props}
    />
  );
}
