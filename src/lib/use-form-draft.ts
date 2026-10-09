"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./client";
import { formDefinitionSchema, type FormRecord } from "./forms";

export function useFormDraft(
  initial: FormRecord,
  onSaved: (form: FormRecord) => void,
) {
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<
    "saved" | "dirty" | "saving" | "error" | "conflict"
  >("saved");
  const [error, setError] = useState("");
  const current = useRef(initial);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);
  const request = useRef<{
    key: string;
    body: string;
    checkpoint: number;
  } | null>(null);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const savedCallback = useRef(onSaved);
  useEffect(() => {
    savedCallback.current = onSaved;
  }, [onSaved]);
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (saving.current) {
      await saving.current;
      return blocked.current ? false : flushRef.current();
    }
    if (version.current === savedVersion.current) return true;
    if (blocked.current) return false;
    const snapshot = current.current;
    const parsed = formDefinitionSchema.safeParse(snapshot.definition);
    if (!parsed.success) {
      setState("error");
      setError(
        parsed.error.issues[0]?.message ??
          "Complete the question settings before saving.",
      );
      return false;
    }
    request.current ??= {
      key: crypto.randomUUID(),
      checkpoint: version.current,
      body: JSON.stringify({
        revision: snapshot.revision,
        definition: parsed.data,
        favorite: snapshot.favorite,
        uploadBudget: snapshot.uploadBudget,
        deadline: snapshot.deadline,
      }),
    };
    const operation = request.current;
    const checkpoint = operation.checkpoint;
    setState("saving");
    const pending = (async () => {
      try {
        const result = await api<FormRecord>(`forms/${snapshot.id}`, {
          method: "PATCH",
          headers: { "Idempotency-Key": operation.key },
          body: operation.body,
        });
        savedVersion.current = checkpoint;
        request.current = null;
        current.current =
          checkpoint === version.current
            ? result
            : {
                ...result,
                definition: current.current.definition,
                favorite: current.current.favorite,
                uploadBudget: current.current.uploadBudget,
                deadline: current.current.deadline,
              };
        if (mounted.current) {
          setForm(current.current);
          setError("");
          setState(checkpoint === version.current ? "saved" : "dirty");
        }
        savedCallback.current(result);
        return true;
      } catch (failure) {
        blocked.current = failure instanceof ApiError && failure.status === 409;
        if (mounted.current) {
          setState(blocked.current ? "conflict" : "error");
          setError(
            failure instanceof Error
              ? failure.message
              : "Your form could not be saved. Try again.",
          );
        }
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = pending;
    const success = await pending;
    return success && savedVersion.current !== version.current
      ? flushRef.current()
      : success;
  }, []);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => {
    mounted.current = true;
    const unload = (event: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  const change = useCallback((update: (form: FormRecord) => FormRecord) => {
    current.current = update(current.current);
    version.current++;
    setForm(current.current);
    setState(blocked.current ? "conflict" : "dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), 650);
  }, []);
  const accept = useCallback((next: FormRecord) => {
    if (version.current !== savedVersion.current || saving.current)
      return false;
    current.current = next;
    setForm(next);
    return true;
  }, []);
  const reset = useCallback((next: FormRecord) => {
    clearTimeout(timer.current);
    blocked.current = false;
    request.current = null;
    savedVersion.current = ++version.current;
    current.current = next;
    setForm(next);
    setState("saved");
    setError("");
  }, []);
  return {
    form,
    state,
    error,
    change,
    accept,
    reset,
    flush,
    dirty: state !== "saved",
    current,
  };
}
