"use client";
import { createCheckListItemBlockSpec } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Checkbox } from "./ui/checkbox";
const original = createCheckListItemBlockSpec();
export const checklistBlockSpec = createReactBlockSpec(
  original.config,
  {
    meta: original.implementation.meta,
    parse: original.implementation.parse,
    parseContent: original.implementation.parseContent,
    runsBefore: original.implementation.runsBefore,
    render: ({ block, editor, contentRef }) => (
      <div className="editor-checklist">
        <span className="editor-check" contentEditable={false}>
          <Checkbox
            aria-label="Complete checklist item"
            checked={block.props.checked}
            disabled={!editor.isEditable}
            onCheckedChange={(checked) => {
              if (editor.isEditable)
                editor.updateBlock(block, {
                  props: { checked: checked === true },
                });
            }}
          />
        </span>
        <p ref={contentRef} />
      </div>
    ),
    toExternalHTML: ({ block, contentRef }) => (
      <li>
        <input type="checkbox" defaultChecked={block.props.checked} />
        <p ref={contentRef} />
      </li>
    ),
  },
  original.extensions,
)();
