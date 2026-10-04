"use client";
import { createCheckListItemBlockSpec } from "@blocknote/core";
const original = createCheckListItemBlockSpec();
export const checklistBlockSpec: typeof original = {
  ...original,
  implementation: {
    ...original.implementation,
    render(block, editor) {
      const result = original.implementation.render.call(this, block, editor);
      result.dom
        .querySelector('input[type="checkbox"]')
        ?.setAttribute("aria-label", "Complete checklist item");
      return result;
    },
  },
};
