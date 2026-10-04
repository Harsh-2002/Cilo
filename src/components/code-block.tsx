"use client";
import { useState } from "react";
import { createCodeBlockSpec } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { codeBlockOptions } from "@blocknote/code-block";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";
const languages = Object.entries(codeBlockOptions.supportedLanguages || {}).map(
  ([id, language]) => ({
    id,
    name: language.name,
    aliases: language.aliases || [],
  }),
);
function LanguagePicker({
  language,
  onChange,
}: {
  language: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-label="Code language"
          aria-expanded={open}
        >
          {languages.find((item) => item.id === language)?.name || language}
          <ChevronDown size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="language-popover"
        align="start"
        sideOffset={8}
        collisionPadding={12}
      >
        <Command>
          <CommandInput placeholder="Search languages…" />
          <CommandList>
            <CommandEmpty>No matching language.</CommandEmpty>
            <CommandGroup>
              {languages.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  data-checked={language === item.id}
                  keywords={[item.name, ...item.aliases]}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  {item.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
const original = createCodeBlockSpec(codeBlockOptions);
export const codeBlockSpec = createReactBlockSpec(
  original.config,
  {
    meta: original.implementation.meta,
    parse: original.implementation.parse,
    parseContent: original.implementation.parseContent,
    render: ({ block, editor, contentRef }) => (
      <div className="code-block-layout">
        <div className="code-block-header" contentEditable={false}>
          {editor.isEditable ? (
            <LanguagePicker
              language={block.props.language}
              onChange={(language) =>
                editor.updateBlock(block, { props: { language } })
              }
            />
          ) : (
            <span>
              {languages.find((item) => item.id === block.props.language)
                ?.name || block.props.language}
            </span>
          )}
        </div>
        <pre>
          <code ref={contentRef} />
        </pre>
      </div>
    ),
    toExternalHTML: ({ block, contentRef }) => (
      <pre>
        <code
          className={`language-${block.props.language}`}
          data-language={block.props.language}
          ref={contentRef}
        />
      </pre>
    ),
  },
  original.extensions,
)();
