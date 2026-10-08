"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function TaskReminders({
  id,
  revision,
  onDirty,
}: {
  id: string;
  revision: number;
  onDirty: (value: boolean) => void;
}) {
  const [values, setValues] = useState({ planned: "", due: "" }),
    [initial, setInitial] = useState({ planned: "", due: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [zones, setZones] = useState(() => ({
      planned: Intl.DateTimeFormat().resolvedOptions().timeZone,
      due: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    const abort = new AbortController();
    void api<
      { field: "planned" | "due"; offsets: number[]; timezone: string }[]
    >(`calendar/task-reminders/${id}`, { signal: abort.signal })
      .then((rows) => {
        const value = { planned: "", due: "" };
        for (const row of rows) value[row.field] = row.offsets.join(", ");
        setZones((current) => {
          const next = { ...current };
          for (const row of rows) next[row.field] = row.timezone;
          return next;
        });
        setValues(value);
        setInitial(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError((e as Error).message);
      });
    return () => abort.abort();
  }, [id]);
  useEffect(() => {
    onDirty(dirty || busy);
    return () => onDirty(false);
  }, [dirty, busy, onDirty]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const definitions = (["planned", "due"] as const).map((field) => {
        const offsets = values[field].trim()
          ? values[field].split(",").map((value) => Number(value.trim()))
          : [];
        if (
          offsets.length > 3 ||
          offsets.some(
            (value) => !Number.isInteger(value) || value < 0 || value > 10080,
          )
        )
          throw Error("Use up to three minute offsets between 0 and 10080.");
        return { field, offsets };
      });
      for (const { field, offsets } of definitions) {
        if (values[field] === initial[field]) continue;
        await api(`calendar/task-reminders/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            revision,
            field,
            offsets,
            timezone: zones[field],
          }),
        });
      }
      setInitial(values);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="schedule-details">
      <summary>Task reminders</summary>
      <p className="picker-message">Enter minutes before 09:00 on each date.</p>
      {(["planned", "due"] as const).map((field) => (
        <label className="schedule-field" key={field}>
          <span>{field === "planned" ? "Planned date" : "Due date"}</span>
          <small>09:00 in {zones[field]}</small>
          <Input
            value={values[field]}
            aria-label={`${field} reminder minutes`}
            placeholder="e.g. 0, 15, 60"
            onChange={(e) =>
              setValues((current) => ({ ...current, [field]: e.target.value }))
            }
          />
        </label>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!dirty || busy}
        onClick={() => void save()}
      >
        Save reminders
      </Button>
    </details>
  );
}
