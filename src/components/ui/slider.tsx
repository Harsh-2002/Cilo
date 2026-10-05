"use client";
import type { ComponentProps } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "cn";
export function Slider({
  className,
  "aria-label": label,
  "aria-valuetext": valueText,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("cilo-slider", className)} {...props}>
      <SliderPrimitive.Track className="cilo-slider-track">
        <SliderPrimitive.Range className="cilo-slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="cilo-slider-thumb"
        aria-label={label}
        aria-valuetext={valueText}
      />
    </SliderPrimitive.Root>
  );
}
