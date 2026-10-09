"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  FileQuestion,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/client";
import { useCompletion } from "@/lib/completion-client";
import type { FormSummary } from "@/lib/forms";
import { SectionHeading } from "./section-heading";
import { LoadingState } from "./loading-state";
import { useConfirm } from "./confirm-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type FormPage = { items: FormSummary[]; total: number; next: string | null };
const statusNames = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};
export function FormsPanel({
  onNavigation,
  onOpen,
}: {
  onNavigation: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState<FormPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const generation = useRef(0);
  const mutation = useRef<{ action: string; key: string } | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const confirm = useConfirm();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const ticket = ++generation.current;
      try {
        const result = await api<FormPage>(
          `forms?${new URLSearchParams({ q: search, status, limit: "60" })}`,
          { signal },
        );
        if (signal?.aborted || ticket !== generation.current) return;
        setPage(result);
        setError("");
      } catch (failure) {
        if (!signal?.aborted && ticket === generation.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Forms could not be loaded. Try again.",
          );
      }
    },
    [search, status],
  );
  useEffect(() => {
    const controller = new AbortController();
    const start = setTimeout(() => {
      setPage(null);
      void load(controller.signal);
    }, 0);
    return () => {
      clearTimeout(start);
      controller.abort();
    };
  }, [load]);
  useEffect(() => () => clearTimeout(completionTimer.current), []);
  useCompletion("content", (event) => {
    if (event.target && event.status !== "forms" && event.status !== "tags")
      return;
    clearTimeout(completionTimer.current);
    completionTimer.current = setTimeout(() => void load(), 120);
  });
  async function loadMore() {
    if (!page?.next) return;
    const ticket = generation.current;
    setMore(true);
    try {
      const result = await api<FormPage>(
        `forms?${new URLSearchParams({ q: search, status, limit: "60", after: page.next })}`,
      );
      if (ticket === generation.current)
        setPage((current) =>
          current
            ? {
                ...result,
                items: [
                  ...current.items,
                  ...result.items.filter(
                    (item) =>
                      !current.items.some(
                        (existing) => existing.id === item.id,
                      ),
                  ),
                ],
              }
            : result,
        );
    } catch (failure) {
      if (ticket === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "More forms could not be loaded. Try again.",
        );
    } finally {
      setMore(false);
    }
  }
  async function change(
    action: "create" | "duplicate" | "trash",
    form?: FormSummary,
  ) {
    if (
      action === "trash" &&
      !(await confirm({
        title: "Move form to Trash?",
        description:
          "The public link will stop working. Your submissions and files stay with the form.",
        action: "Move to Trash",
      }))
    )
      return;
    const identity = `${action}:${form?.id ?? "new"}`;
    if (mutation.current?.action !== identity)
      mutation.current = { action: identity, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>(
        action === "create"
          ? "forms"
          : action === "duplicate"
            ? `forms/${form!.id}/duplicate`
            : `forms/${form!.id}`,
        {
          method: action === "trash" ? "DELETE" : "POST",
          headers: { "Idempotency-Key": mutation.current.key },
          body: JSON.stringify(
            action === "trash" ? { revision: form!.revision } : {},
          ),
        },
      );
      mutation.current = null;
      if (action === "trash") await load();
      else onOpen(result.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This action could not be completed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const filtered = !!search || status !== "all";
  return (
    <section className="tasks-panel">
      <div
        className="tasks-scroll"
        tabIndex={0}
        role="region"
        aria-label="Forms"
      >
        <div className="section-content">
          <SectionHeading
            title="Forms"
            description="Build forms and keep responses together."
            onNavigation={onNavigation}
          />
          <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                className="w-full min-w-0 data-[size=default]:h-11 md:w-auto md:min-w-36"
                aria-label="Form status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All forms</SelectItem>
                {Object.entries(statusNames).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto md:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search forms"
                placeholder="Search forms…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 pl-9"
              />
            </div>
            <Button
              className="col-start-2 row-start-1 h-11 md:col-start-auto md:row-start-auto"
              disabled={busy}
              onClick={() => void change("create")}
            >
              <Plus />
              New form
            </Button>
          </div>
          {error && (
            <div
              className="mb-5 flex flex-wrap items-center gap-3"
              role="alert"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}
          {!page && !error ? (
            <LoadingState kind="notes" label="Loading forms" />
          ) : page && !page.items.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileQuestion
                className="size-7 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-semibold">
                {filtered ? "No matching forms" : "Your first form starts here"}
              </h2>
              <p className="max-w-sm text-muted-foreground">
                {filtered
                  ? "Try a different search or clear your filters."
                  : "Add questions, share a link and see responses in one place."}
              </p>
              <Button
                variant={filtered ? "outline" : "default"}
                disabled={busy}
                onClick={() =>
                  filtered
                    ? (setQuery(""), setStatus("all"))
                    : void change("create")
                }
              >
                {filtered ? "Clear filters" : "New form"}
              </Button>
            </div>
          ) : page ? (
            <>
              <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_2.75rem] gap-4 px-4 pb-3 text-xs text-muted-foreground md:grid">
                <span className="pl-3">Form</span>
                <span>Status</span>
                <span>Responses</span>
                <span>Latest response</span>
                <span className="sr-only">Actions</span>
              </div>
              <ul className="space-y-3 md:space-y-0">
                {page.items.map((form) => (
                  <li
                    key={form.id}
                    className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-x-3 rounded-xl border px-4 py-3 md:grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_2.75rem] md:gap-4 md:rounded-none md:border-0 md:border-t md:px-4 md:py-4"
                  >
                    <Button
                      variant="ghost"
                      className="h-auto min-w-0 justify-start px-3 py-2 text-left"
                      onClick={() => onOpen(form.id)}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {form.title || "Untitled form"}
                      </span>
                    </Button>
                    <span className="col-start-1 mt-1 text-sm text-muted-foreground md:col-auto md:mt-0">
                      {statusNames[form.status]}
                    </span>
                    <span className="col-start-1 mt-2 text-sm tabular-nums md:col-auto md:mt-0">
                      {form.total.toLocaleString()}
                      <span className="ml-1 md:hidden">
                        {form.total === 1 ? "response" : "responses"}
                      </span>
                      {form.newCount > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {form.newCount.toLocaleString()} new
                        </span>
                      )}
                    </span>
                    <span className="col-start-1 mt-1 text-sm text-muted-foreground md:col-auto md:mt-0">
                      {form.lastSubmittedAt
                        ? new Date(form.lastSubmittedAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric", year: "numeric" },
                          )
                        : "No responses yet"}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="col-start-2 row-start-1 size-11 md:col-auto md:row-auto md:size-8"
                          disabled={busy}
                          aria-label={`Actions for ${form.title || "Untitled form"}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => void change("duplicate", form)}
                        >
                          <Copy />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void change("trash", form)}
                        >
                          <Trash2 />
                          Move to Trash
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground tabular-nums">
                  {page.total.toLocaleString()}{" "}
                  {page.total === 1 ? "form" : "forms"}
                </p>
                {page.next && (
                  <Button
                    variant="outline"
                    disabled={more}
                    onClick={() => void loadMore()}
                  >
                    {more ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
