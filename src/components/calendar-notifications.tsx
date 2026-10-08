"use client";
import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { api } from "@/lib/client";
import { useCompletion } from "@/lib/completion-client";
import { Button } from "./ui/button";
import {
  canUseDeviceNotifications,
  deviceNotificationsEnabled,
  enableDeviceNotifications,
  disableDeviceNotifications,
  notificationError,
  notificationUpdate,
} from "@/lib/push-notifications";
type Reminders = {
  items: { id: string; title: string; scheduledAt: number; state: string }[];
  nextOffset: number | null;
};
export function CalendarNotifications() {
  const [items, setItems] = useState<Reminders | null>(null),
    [enabled, setEnabled] = useState(false),
    [supported, setSupported] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function load() {
    try {
      setItems(await api<Reminders>("calendar/reminders"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!canUseDeviceNotifications()) return;
      if (active) setSupported(true);
      try {
        const enabled = await deviceNotificationsEnabled();
        if (active) setEnabled(enabled);
      } catch {
        if (active) setEnabled(false);
      }
    };
    const timer = setTimeout(() => {
      void load();
      void check();
    }, 0);
    window.addEventListener(notificationUpdate, check);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener(notificationUpdate, check);
    };
  }, []);
  useCompletion(undefined, () => void load());
  async function toggle() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (enabled) await disableDeviceNotifications();
      else await enableDeviceNotifications();
      setEnabled(!enabled);
    } catch (error) {
      setError(notificationError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="schedule-reminders">
      <header>
        <h3>
          <Bell size={18} />
          Reminders
        </h3>
        {supported && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void toggle()}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {enabled ? "Disable on this device" : "Enable on this device"}
          </Button>
        )}
      </header>
      {!supported && (
        <p>
          Device notifications require a supported browser over HTTPS. On iPhone
          or iPad, open the installed Home Screen app.
        </p>
      )}
      {enabled && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            setStatus("");
            void api("calendar/subscriptions/test", { method: "POST" })
              .then(() =>
                setStatus(
                  "Test reminder queued. Your device should receive it shortly.",
                ),
              )
              .catch((e) => setError((e as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          Send test notification
        </Button>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {items === null ? (
        <p role="status">Loading reminders…</p>
      ) : !items.items.length ? (
        <p>No reminders yet. Add one to an event or a dated task.</p>
      ) : (
        items.items.map((item) => (
          <div className="schedule-reminder" key={item.id}>
            <span>
              <strong>{item.title}</strong>
              <small>
                {new Date(item.scheduledAt).toLocaleString()}
                {item.state === "missed" ? " · Missed" : ""}
              </small>
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss reminder"
              onClick={() => {
                void api(`calendar/reminders/${item.id}`, { method: "PATCH" })
                  .then(load)
                  .catch((e) => setError((e as Error).message));
              }}
            >
              <X size={16} />
            </Button>
          </div>
        ))
      )}
      {items?.nextOffset !== null && items?.nextOffset !== undefined && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api<Reminders>(`calendar/reminders?offset=${items.nextOffset}`)
              .then((value) =>
                setItems((current) =>
                  current
                    ? { ...value, items: [...current.items, ...value.items] }
                    : value,
                ),
              )
              .catch((e) => setError((e as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          Load more reminders
        </Button>
      )}
    </section>
  );
}
