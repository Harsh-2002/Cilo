"use client";
import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import {
  canUseDeviceNotifications,
  deviceNotificationsEnabled,
  enableDeviceNotifications,
  notificationError,
  notificationPromptKey,
  notificationUpdate,
  rememberNotificationChoice,
} from "@/lib/push-notifications";
import { Button } from "./ui/button";

export function NotificationSetup() {
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!canUseDeviceNotifications() || Notification.permission === "denied")
        return;
      try {
        if (localStorage.getItem(notificationPromptKey) === "dismissed") {
          if (active) setVisible(false);
          return;
        }
        const enabled = await deviceNotificationsEnabled();
        if (active) setVisible(!enabled);
      } catch {}
    };
    void check();
    window.addEventListener(notificationUpdate, check);
    return () => {
      active = false;
      window.removeEventListener(notificationUpdate, check);
    };
  }, []);
  if (!visible) return null;
  return (
    <section className="notification-setup" aria-label="Device reminders">
      <div className="notification-setup-copy">
        <Bell size={18} aria-hidden="true" />
        <div>
          <h2>Get reminders on this device</h2>
          <p>Get a notification when a task or event is due.</p>
        </div>
      </div>
      <div className="notification-setup-actions">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            rememberNotificationChoice("dismissed");
            setVisible(false);
          }}
        >
          Not now
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void enableDeviceNotifications()
              .then(() => setVisible(false))
              .catch((error) => setError(notificationError(error)))
              .finally(() => setBusy(false));
          }}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Enable notifications
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
