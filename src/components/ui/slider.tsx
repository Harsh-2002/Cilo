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
    <SliderPrimitive.Root className={cn("nivra-slider", className)} {...props}>
      <SliderPrimitive.Track className="nivra-slider-track">
        <SliderPrimitive.Range className="nivra-slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="nivra-slider-thumb"
        aria-label={label}
        aria-valuetext={valueText}
      />
    </SliderPrimitive.Root>
  );
}
