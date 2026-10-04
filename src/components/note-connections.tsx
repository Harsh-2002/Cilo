"use client";
import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, FileText, Link2, ListTodo } from "lucide-react";
import { api } from "@/lib/client";
import type { Connections, SearchResult } from "@/lib/types";
import { Button } from "./ui/button";
export function NoteConnections({
  noteId,
  revision,
  onOpenNote,
  onOpenItem,
}: {
  noteId: string;
  revision: number;
  onOpenNote: (id: string) => Promise<boolean>;
  onOpenItem: (item: SearchResult) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Connections | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void api<Connections>(`notes/${noteId}/connections`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [open, noteId, revision, retry]);
  const count = data
    ? data.incoming.length +
      data.outgoing.length +
      data.tasks.length +
      data.bookmarks.length
    : 0;
  return (
    <section className="note-connections">
      <Button
        type="button"
        variant="ghost"
        className="connections-toggle"
        aria-expanded={open}
        aria-controls={`connections-${noteId}`}
        onClick={() => setOpen(!open)}
      >
        <Link2 size={15} />
        Related items{data && <span>{count}</span>}
        <ChevronDown size={14} className={open ? "is-open" : ""} />
      </Button>
      {open && (
        <div id={`connections-${noteId}`} className="connections-content">
          {error ? (
            <div role="alert">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry
              </Button>
            </div>
          ) : !data ? (
            <p role="status">Finding connections…</p>
          ) : !count ? (
            <p>
              Type [[ in your note to connect an idea, or link a task or
              bookmark to this note.
            </p>
          ) : (
            <>
              {(
                [
                  { name: "Backlinks", items: data.incoming },
                  { name: "Links from this note", items: data.outgoing },
                ] as const
              ).map((group) =>
                group.items.length ? (
                  <div key={group.name}>
                    <h3>{group.name}</h3>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className="connection-row"
                        onClick={() => void onOpenNote(item.id)}
                      >
                        <FileText size={14} />
                        <span>{item.title || "Untitled"}</span>
                      </button>
                    ))}
                  </div>
                ) : null,
              )}
              {data.tasks.length > 0 && (
                <div>
                  <h3>Tasks</h3>
                  {data.tasks.map((item) => (
                    <button
                      key={item.id}
                      className="connection-row"
                      onClick={() =>
                        void onOpenItem({
                          ...item,
                          type: "task",
                          excerpt: "",
                          updatedAt: 0,
                        })
                      }
                    >
                      <ListTodo size={14} />
                      <span>{item.title}</span>
                      {item.completed && <small>Completed</small>}
                    </button>
                  ))}
                </div>
              )}
              {data.bookmarks.length > 0 && (
                <div>
                  <h3>Bookmarks</h3>
                  {data.bookmarks.map((item) => (
                    <button
                      key={item.id}
                      className="connection-row"
                      onClick={() =>
                        void onOpenItem({
                          ...item,
                          type: "bookmark",
                          excerpt: item.url,
                          updatedAt: 0,
                        })
                      }
                    >
                      <Bookmark size={14} />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
