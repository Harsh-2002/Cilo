"use client";
import { LoadingState } from "./loading-state";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { notify } from "@/lib/feedback";
import { api } from "@/lib/client";
import { sectionCache } from "@/lib/section-cache";
import { useCompletion } from "@/lib/completion-client";
import type { Page, TrashItem, TrashKind } from "@/lib/types";
import { SectionHeading } from "./section-heading";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useConfirm } from "./confirm-provider";

const names: Record<TrashKind, string> = {
  note: "Note",
  journal: "Journal entry",
  task: "Task",
  bookmark: "Bookmark",
  artifact: "Artifact",
  event: "Event",
  form: "Form",
  form_response: "Form submission",
};
export function TrashPanel({ onNavigation }: { onNavigation: () => void }) {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef({ value: 0 });
  const confirm = useConfirm();
  const load = useCallback(
    async (after?: string) => {
      const seq = ++sequence.current.value;
      try {
        setError("");
        const params = new URLSearchParams({
          q: query,
          ...(kind === "all" ? {} : { kind }),
          ...(after ? { after } : {}),
        });
        const result = await api<Page<TrashItem>>(`trash?${params}`);
        if (seq !== sequence.current.value) return;
        setItems((previous) =>
          after ? [...(previous ?? []), ...result.items] : result.items,
        );
        setNext(result.next);
      } catch (e) {
        if (seq === sequence.current.value) setError((e as Error).message);
      }
    },
    [query, kind],
  );
  useEffect(() => {
    const requests = sequence.current;
    const timer = setTimeout(() => {
      setItems(null);
      void load();
    }, 180);
    return () => {
      clearTimeout(timer);
      requests.value++;
    };
  }, [load]);
  useCompletion(undefined, () => void load());
  async function action(item: TrashItem, permanent: boolean) {
    if (
      permanent &&
      !(await confirm({
        title: "Delete this item permanently?",
        description: `“${item.title || "Untitled"}” and its stored files will be removed. This cannot be undone.`,
        action: "Delete permanently",
      }))
    )
      return;
    notify.dismiss();
    setBusy(true);
    try {
      await api(`trash/${item.kind}/${item.id}${permanent ? "" : "/restore"}`, {
        method: permanent ? "DELETE" : "POST",
        body: JSON.stringify({ revision: item.revision }),
      });
      sectionCache.clear();
      notify.success(
        permanent
          ? "Item deleted permanently."
          : `${names[item.kind]} restored.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tasks-panel trash-panel" aria-label="Trash">
      <div
        className="tasks-scroll"
        tabIndex={0}
        role="region"
        aria-label="Trash"
      >
        <div className="section-content">
          <SectionHeading
            title="Trash"
            description="Deleted items. Restore what you need, or delete it permanently."
            onNavigation={onNavigation}
          />
          <div className="bookmark-toolbar section-toolbar">
            <Select value={kind} onValueChange={setKind} disabled={busy}>
              <SelectTrigger aria-label="Deleted item type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                {Object.entries(names).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="task-search">
              <Search size={15} aria-hidden="true" />
              <Input
                aria-label="Search deleted items"
                placeholder="Search deleted items…"
                value={query}
                maxLength={300}
                disabled={busy}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <div className="tasks-error" role="alert">
              <p>{error}</p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void load()}
              >
                Reload Trash
              </Button>
            </div>
          )}
          {items === null ? (
            !error && (
              <LoadingState kind="trash" label="Loading deleted items" />
            )
          ) : items.length ? (
            <ul
              className="trash-list"
              aria-label="Deleted items"
              aria-busy={busy}
            >
              {items.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <div className="trash-item-copy">
                    <h2>{item.title || "Untitled"}</h2>
                    {item.excerpt && item.excerpt !== item.title && (
                      <p>{item.excerpt}</p>
                    )}
                    <span>
                      {names[item.kind]} · Deleted{" "}
                      <time dateTime={new Date(item.trashedAt).toISOString()}>
                        {new Date(item.trashedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </time>
                    </span>
                  </div>
                  <div className="trash-item-actions">
                    <Button
                      variant="outline"
                      disabled={busy}
                      aria-label={`Restore ${item.title || "Untitled"}`}
                      onClick={() => void action(item, false)}
                    >
                      <RotateCcw size={15} />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Delete ${item.title || "Untitled"} permanently`}
                      onClick={() => void action(item, true)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tasks-empty">
              <Trash2 size={32} strokeWidth={1} />
              <h2>
                {query || kind !== "all"
                  ? "No matching deleted items"
                  : "Nothing in Trash"}
              </h2>
              <p>
                {query || kind !== "all"
                  ? "Try another search or item type."
                  : "Deleted notes, journal entries, tasks, bookmarks and artifacts appear here."}
              </p>
            </div>
          )}
          {next && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await load(next);
                setBusy(false);
              }}
            >
              Load more
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
