"use client";
import { Check } from "lucide-react";
import { Button } from "./ui/button";
import { tagColors, type TagColor } from "@/lib/tags";
export function TagColorPicker({
  value,
  onChange,
}: {
  value: TagColor;
  onChange: (value: TagColor) => void;
}) {
  return (
    <fieldset className="tag-color-picker">
      <legend>Tag color</legend>
      <div>
        {tagColors.map((color) => (
          <Button
            key={color}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${color[0].toUpperCase()}${color.slice(1)} tag color`}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
          >
            <span className="tag-swatch" data-color={color}>
              {value === color && <Check size={12} />}
            </span>
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
