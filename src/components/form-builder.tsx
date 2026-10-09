"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import {
  StyleInjector,
  defaultPreset,
  KeyboardSensor,
  PointerSensor,
  PointerActivationConstraints,
} from "@dnd-kit/dom";
import { useCspNonce } from "@/lib/csp";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  displayField,
  changeFormFieldType,
  formFieldSchema,
  formFieldTypes,
  confirmationField,
  confirmationVariables,
  editableConfirmation,
  encodeConfirmation,
  retargetConfirmation,
  type FormDefinition,
  type FormField,
} from "@/lib/forms";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useConfirm } from "./confirm-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const questionSensors = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 }),
    ],
    preventActivation: (event) =>
      event.target instanceof Element &&
      event.target.closest("[data-no-drag]") !== null,
  }),
  KeyboardSensor,
];

function SortableQuestion({
  field,
  index,
  count,
  onMove,
  onDuplicate,
  onRemove,
  onType,
  onInsert,
  children,
}: {
  field: FormField;
  index: number;
  count: number;
  onMove: (direction: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onType: (type: FormField["type"]) => void;
  onInsert: () => void;
  children: ReactNode;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: field.id,
    index,
    group: "questions",
    type: "question",
    accept: "question",
    transition: null,
    plugins: [SortableKeyboardPlugin],
    sensors: questionSensors,
  });
  return (
    <li
      ref={ref}
      data-field-id={field.id}
      className={`form-question-block ${isDragSource ? "is-dragging" : ""}`}
    >
      <header
        ref={handleRef}
        className="form-question-header form-question-handle"
        role="group"
        tabIndex={0}
        aria-label={`Reorder question ${index + 1}`}
        aria-describedby="form-reorder-help"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sm font-medium">{index + 1}.</span>
          <Select
            value={field.type}
            onValueChange={(value) => onType(value as FormField["type"])}
          >
            <SelectTrigger
              className="form-question-type"
              data-no-drag
              aria-label={`Question ${index + 1} type`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formFieldTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {formTypeNames[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-no-drag
              aria-label={`Question ${index + 1} actions`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={index === 0}
              onSelect={() => onMove(-1)}
            >
              <ArrowUp />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === count - 1}
              onSelect={() => onMove(1)}
            >
              <ArrowDown />
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem disabled={count >= 100} onSelect={onInsert}>
              <Plus />
              Add question below
            </DropdownMenuItem>
            <DropdownMenuItem disabled={count >= 100} onSelect={onDuplicate}>
              <Copy />
              Duplicate question
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRemove}>
              <Trash2 />
              Remove question
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {children}
    </li>
  );
}

export const formTypeNames: Record<FormField["type"], string> = {
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone",
  url: "Website",
  number: "Number",
  amount: "Amount",
  rating: "Rating",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  dropdown: "Dropdown",
  yes_no: "Yes or no",
  date: "Date",
  time: "Time",
  file: "File upload",
  consent: "Consent",
  heading: "Heading",
  description: "Description",
  section: "Section",
};
const choiceTypes = ["single_choice", "multiple_choice", "dropdown"];
function newField(type: FormField["type"]): FormField {
  return formFieldSchema.parse({
    id: crypto.randomUUID(),
    type,
    label: "",
    ...(choiceTypes.includes(type)
      ? {
          choices: [
            { id: crypto.randomUUID(), label: "Option 1" },
            { id: crypto.randomUUID(), label: "Option 2" },
          ],
        }
      : {}),
  });
}
export function FormBuilder({
  definition,
  onChange,
}: {
  definition: FormDefinition;
  onChange: (definition: FormDefinition) => void;
}) {
  const [dragFields, setDragFields] = useState<FormField[] | null>(null);
  const dragOrder = useRef<FormField[] | null>(null);
  const nonce = useCspNonce();
  const plugins = useMemo(
    () => [...defaultPreset.plugins, StyleInjector.configure({ nonce })],
    [nonce],
  );
  const [help, setHelp] = useState<string | null>(null);
  const [type, setType] = useState<FormField["type"]>("short_text");
  const [expanded, setExpanded] = useState<string | null>(null);
  const fieldNodes = useRef(new Map<string, HTMLInputElement>());
  const confirmationInput = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();
  function update(id: string, patch: Partial<FormField>) {
    onChange({
      ...definition,
      fields: definition.fields.map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    });
  }
  async function changeType(field: FormField, type: FormField["type"]) {
    const next = changeFormFieldType(field, type);
    const resetsLimits =
      (field.minimum !== undefined && next.minimum === undefined) ||
      (field.maximum !== undefined && next.maximum === undefined);
    const removesAnswer =
      !confirmationField(next) &&
      definition.confirmation.includes(`{{field:${field.id}}}`);
    if (
      (resetsLimits || removesAnswer) &&
      !(await confirm({
        title: "Change question type?",
        description: [
          resetsLimits ? "Your minimum and maximum limits will reset." : "",
          removesAnswer
            ? "This question's answer will be removed from the confirmation message."
            : "",
          "Your question and existing submissions stay unchanged.",
        ]
          .filter(Boolean)
          .join(" "),
        action: "Change type",
      }))
    )
      return;
    onChange({
      ...definition,
      fields: definition.fields.map((item) =>
        item.id === field.id ? next : item,
      ),
      confirmation: retargetConfirmation(
        definition.confirmation,
        field.id,
        confirmationField(next) ? next.id : undefined,
      ),
    });
    requestAnimationFrame(() => fieldNodes.current.get(next.id)?.focus());
  }
  function add(field: FormField, after?: number) {
    const fields = [...definition.fields];
    fields.splice(after === undefined ? fields.length : after + 1, 0, field);
    onChange({ ...definition, fields });
    requestAnimationFrame(() => fieldNodes.current.get(field.id)?.focus());
  }
  function move(index: number, distance: number) {
    const fields = [...definition.fields];
    const [field] = fields.splice(index, 1);
    fields.splice(index + distance, 0, field);
    onChange({ ...definition, fields });
    requestAnimationFrame(() => fieldNodes.current.get(field.id)?.focus());
  }
  async function remove(field: FormField) {
    if (
      !(await confirm({
        title: "Remove question?",
        description:
          "Existing submissions keep this question and its answers. It will be removed from your draft." +
          (definition.confirmation.includes(`{{field:${field.id}}}`)
            ? " Its answer will also be removed from the confirmation message."
            : ""),
        action: "Remove question",
      }))
    )
      return;
    onChange({
      ...definition,
      fields: definition.fields.filter((item) => item.id !== field.id),
      confirmation: retargetConfirmation(definition.confirmation, field.id),
    });
  }
  function insertAnswer(name: string) {
    const input = confirmationInput.current;
    const text = editableConfirmation(definition);
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? start;
    const token = `{{${name}}}`;
    const next = encodeConfirmation(
      definition,
      text.slice(0, start) + token + text.slice(end),
    );
    if (next.length > 2000) return;
    onChange({ ...definition, confirmation: next });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return (
    <div className="form-builder mx-auto w-full max-w-3xl pb-12">
      <div className="space-y-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Form title</span>
          <Input
            value={definition.title}
            maxLength={300}
            placeholder="Untitled form"
            onChange={(event) =>
              onChange({ ...definition, title: event.target.value })
            }
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Description{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </span>
          <Textarea
            value={definition.description}
            maxLength={5000}
            placeholder="Tell people what this form is for."
            onChange={(event) =>
              onChange({ ...definition, description: event.target.value })
            }
          />
        </label>
      </div>
      <p id="form-reorder-help" className="sr-only">
        Hold a question header to drag. With the header focused, press Space,
        use arrow keys to move, and press Space to drop. The question menu also
        has Move up and Move down.
      </p>
      <DragDropProvider
        plugins={plugins}
        onDragStart={() => {
          dragOrder.current = [...definition.fields];
          setDragFields(dragOrder.current);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          const { source, target } = event.operation;
          if (!source || !target || !isSortable(source) || !dragOrder.current)
            return;
          const fields = [...dragOrder.current];
          const original = fields.findIndex((field) => field.id === source.id);
          const destination = fields.findIndex(
            (field) => field.id === target.id,
          );
          if (original < 0 || destination < 0 || original === destination)
            return;
          const [field] = fields.splice(original, 1);
          fields.splice(destination, 0, field);
          dragOrder.current = fields;
          setDragFields(fields);
        }}
        onDragEnd={(event) => {
          const fields = dragOrder.current;
          dragOrder.current = null;
          setDragFields(null);
          if (
            !event.canceled &&
            fields &&
            fields.some(
              (field, index) => field.id !== definition.fields[index]?.id,
            )
          )
            onChange({ ...definition, fields });
          const id = event.operation.source?.id;
          if (id)
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(
                  `[data-field-id="${id}"] .form-question-handle`,
                )
                ?.focus(),
            );
        }}
      >
        <ol className="mt-8 space-y-4" aria-label="Form questions">
          {(dragFields ?? definition.fields).map((field, index) => (
            <SortableQuestion
              key={field.id}
              field={field}
              index={index}
              count={definition.fields.length}
              onMove={(distance) => move(index, distance)}
              onType={(type) => void changeType(field, type)}
              onInsert={() => add(newField(type), index)}
              onDuplicate={() =>
                add(
                  {
                    ...field,
                    id: crypto.randomUUID(),
                    choices: field.choices.map((choice) => ({
                      ...choice,
                      id: crypto.randomUUID(),
                    })),
                  },
                  index,
                )
              }
              onRemove={() => void remove(field)}
            >
              <div className="space-y-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">
                    {displayField(field) ? "Text" : "Question"}
                  </span>
                  <Input
                    ref={(node) => {
                      if (node) fieldNodes.current.set(field.id, node);
                      else fieldNodes.current.delete(field.id);
                    }}
                    value={field.label}
                    maxLength={300}
                    placeholder={
                      displayField(field) ? "Add text" : "Write your question"
                    }
                    onChange={(event) =>
                      update(field.id, { label: event.target.value })
                    }
                  />
                </label>
                {field.description || help === field.id ? (
                  <label className="grid gap-2">
                    <span className="text-sm">
                      Help text{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </span>
                    <Textarea
                      value={field.description}
                      maxLength={2000}
                      onChange={(event) =>
                        update(field.id, { description: event.target.value })
                      }
                    />
                  </label>
                ) : (
                  <Button variant="ghost" onClick={() => setHelp(field.id)}>
                    Add help text
                  </Button>
                )}
                {choiceTypes.includes(field.type) && (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">
                      Options
                    </legend>
                    {field.choices.map((choice, option) => (
                      <div key={choice.id} className="flex items-center gap-2">
                        <Input
                          aria-label={`Question ${index + 1} option ${option + 1}`}
                          value={choice.label}
                          maxLength={300}
                          onChange={(event) =>
                            update(field.id, {
                              choices: field.choices.map((item) =>
                                item.id === choice.id
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove option ${option + 1}`}
                          onClick={() =>
                            update(field.id, {
                              choices: field.choices.filter(
                                (item) => item.id !== choice.id,
                              ),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      disabled={field.choices.length >= 100}
                      onClick={() =>
                        update(field.id, {
                          choices: [
                            ...field.choices,
                            {
                              id: crypto.randomUUID(),
                              label: `Option ${field.choices.length + 1}`,
                            },
                          ],
                        })
                      }
                    >
                      <Plus />
                      Add option
                    </Button>
                  </fieldset>
                )}
                {!displayField(field) && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          update(field.id, { required: checked === true })
                        }
                      />
                      <span className="text-sm">Required</span>
                    </label>
                    <Button
                      variant="ghost"
                      aria-expanded={expanded === field.id}
                      aria-controls={`settings-${field.id}`}
                      onClick={() =>
                        setExpanded(expanded === field.id ? null : field.id)
                      }
                    >
                      Question settings
                    </Button>
                  </div>
                )}
                {expanded === field.id && !displayField(field) && (
                  <div id={`settings-${field.id}`} className="space-y-4 pt-2">
                    {["email", "phone", "url", "date", "time"].includes(
                      field.type,
                    ) && (
                      <p className="text-sm text-muted-foreground">
                        {field.type === "email"
                          ? "Only valid email addresses are accepted."
                          : field.type === "url"
                            ? "Only valid HTTP or HTTPS links are accepted."
                            : field.type === "phone"
                              ? "Accepts phone numbers with international prefixes, spaces and punctuation."
                              : `Only valid ${field.type === "date" ? "dates" : "times"} are accepted.`}
                      </p>
                    )}
                    {["short_text", "long_text"].includes(field.type) && (
                      <label className="grid gap-2">
                        <span className="text-sm">Maximum characters</span>
                        <Input
                          type="number"
                          min={1}
                          max={10000}
                          value={field.maxLength}
                          onChange={(event) =>
                            update(field.id, {
                              maxLength: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    )}
                    {["number", "amount", "rating"].includes(field.type) && (
                      <div className="grid grid-cols-2 gap-4">
                        {(["minimum", "maximum"] as const).map((key) => (
                          <label key={key} className="grid gap-2">
                            <span className="text-sm">
                              {key === "minimum" ? "Minimum" : "Maximum"}
                            </span>
                            <Input
                              type="number"
                              step={field.type === "rating" ? 1 : "any"}
                              value={field[key] ?? ""}
                              placeholder={
                                field.type === "rating"
                                  ? key === "minimum"
                                    ? "1"
                                    : "5"
                                  : "No limit"
                              }
                              onChange={(event) =>
                                update(field.id, {
                                  [key]:
                                    event.target.value === ""
                                      ? undefined
                                      : Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    {field.type === "amount" && (
                      <label className="grid gap-2">
                        <span className="text-sm">Currency</span>
                        <Input
                          value={field.currency}
                          maxLength={3}
                          placeholder="USD"
                          onChange={(event) =>
                            update(field.id, {
                              currency: event.target.value.toUpperCase(),
                            })
                          }
                        />
                      </label>
                    )}
                    {field.type === "file" && (
                      <>
                        <label className="grid gap-2">
                          <span className="text-sm">Maximum files</span>
                          <Input
                            type="number"
                            min={1}
                            max={3}
                            value={field.maxFiles}
                            onChange={(event) =>
                              update(field.id, {
                                maxFiles: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <fieldset>
                          <legend className="mb-2 text-sm">
                            Allowed files
                          </legend>
                          <div className="flex flex-wrap gap-4">
                            {(
                              ["image", "document", "audio", "video"] as const
                            ).map((category) => (
                              <label
                                key={category}
                                className="flex min-h-11 items-center gap-2"
                              >
                                <Checkbox
                                  checked={field.fileTypes.includes(category)}
                                  onCheckedChange={(checked) =>
                                    update(field.id, {
                                      fileTypes: checked
                                        ? [...field.fileTypes, category]
                                        : field.fileTypes.filter(
                                            (item) => item !== category,
                                          ),
                                    })
                                  }
                                />
                                <span className="text-sm capitalize">
                                  {category === "image"
                                    ? "Images"
                                    : category === "document"
                                      ? "Documents"
                                      : category}
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <p className="text-sm text-muted-foreground">
                          Up to 10 MB per file and 25 MB per submission.
                        </p>
                      </>
                    )}
                    {![
                      "short_text",
                      "long_text",
                      "number",
                      "amount",
                      "rating",
                      "file",
                    ].includes(field.type) && (
                      <p className="text-sm text-muted-foreground">
                        This question uses the standard{" "}
                        {formTypeNames[field.type].toLowerCase()} format.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </SortableQuestion>
          ))}
        </ol>
      </DragDropProvider>
      {!definition.fields.length && (
        <p className="my-8 text-sm text-muted-foreground">
          Choose a question type to start building your form.
        </p>
      )}
      <div className="form-builder-add mt-6">
        <Select
          value={type}
          onValueChange={(value) => setType(value as FormField["type"])}
        >
          <SelectTrigger className="w-44" aria-label="New question type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formFieldTypes.map((value) => (
              <SelectItem key={value} value={value}>
                {formTypeNames[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={definition.fields.length >= 100}
          variant="outline"
          onClick={() => add(newField(type))}
        >
          <Plus />
          Add question
        </Button>
        <span className="text-xs text-muted-foreground">
          {definition.fields.length}/100
        </span>
      </div>
      <div className="mt-10 grid gap-2">
        <label htmlFor="form-confirmation" className="text-sm font-medium">
          Confirmation message
        </label>
        <Textarea
          id="form-confirmation"
          ref={confirmationInput}
          value={editableConfirmation(definition)}
          maxLength={2000}
          onChange={(event) =>
            onChange({
              ...definition,
              confirmation: encodeConfirmation(definition, event.target.value),
            })
          }
        />
        <div className="flex flex-wrap items-start gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={
                  !confirmationVariables(definition).length ||
                  definition.confirmation.length + 46 > 2000
                }
              >
                <Plus />
                Insert answer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              collisionPadding={12}
              className="max-h-64 overflow-y-auto"
            >
              {confirmationVariables(definition).map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => insertAnswer(item.name)}
                >
                  <span className="truncate">{item.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
            Shown after submission. Insert an answer to personalize it.
            Unanswered questions leave a blank.
          </p>
        </div>
      </div>
    </div>
  );
}
