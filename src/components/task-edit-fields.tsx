"use client";
import type { Task } from "@/lib/types";
import type { Recurrence } from "@/lib/dates";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { DatePicker } from "./date-picker";
import { NotePicker } from "./note-picker";
import { TaskReminders } from "./task-reminders";
export function TaskEditFields({
  task,
  title,
  setTitle,
  dueDate,
  setDueDate,
  plannedDate,
  setPlannedDate,
  recurrence,
  setRecurrence,
  note,
  setNote,
  disabled,
  onReminderDirty,
}: {
  task: Task;
  title: string;
  setTitle: (value: string) => void;
  dueDate: string | null;
  setDueDate: (value: string | null) => void;
  plannedDate: string | null;
  setPlannedDate: (value: string | null) => void;
  recurrence: Recurrence | null;
  setRecurrence: (value: Recurrence | null) => void;
  note: { id: string | null; title: string | null };
  setNote: (value: { id: string | null; title: string | null }) => void;
  disabled: boolean;
  onReminderDirty: (value: boolean) => void;
}) {
  return (
    <>
      <Label htmlFor={`edit-task-${task.id}`}>Task</Label>
      <Input
        id={`edit-task-${task.id}`}
        autoFocus
        value={title}
        maxLength={300}
        disabled={disabled}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="task-schedule-controls">
        <DatePicker
          label="Planned date"
          value={plannedDate}
          onChange={setPlannedDate}
          disabled={disabled}
        />
        <DatePicker
          value={dueDate}
          onChange={(value) => {
            setDueDate(value);
            if (!value) setRecurrence(null);
          }}
          disabled={disabled}
        />
        <Select
          value={recurrence ?? "none"}
          onValueChange={(value) =>
            setRecurrence(value === "none" ? null : (value as Recurrence))
          }
          disabled={disabled || !dueDate}
        >
          <SelectTrigger aria-label="Task recurrence">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="daily">Every day</SelectItem>
            <SelectItem value="weekly">Every week</SelectItem>
            <SelectItem value="monthly">Every month</SelectItem>
          </SelectContent>
        </Select>
        <NotePicker
          value={note.id}
          title={note.title}
          disabled={disabled}
          onChange={(id, title) => setNote({ id, title })}
        />
      </div>
      <TaskReminders
        id={task.id}
        revision={task.revision}
        onDirty={onReminderDirty}
      />
    </>
  );
}
