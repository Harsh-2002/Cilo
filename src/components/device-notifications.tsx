"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import {
  canUseDeviceNotifications,
  deviceNotificationsEnabled,
  enableDeviceNotifications,
  disableDeviceNotifications,
  notificationError,
  notificationUpdate,
} from "@/lib/push-notifications";
import { Button } from "./ui/button";

export function DeviceNotifications() {
  const [enabled, setEnabled] = useState(false),
    [supported, setSupported] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    const check = async () => {
      const supported = canUseDeviceNotifications();
      if (active) setSupported(supported);
      try {
        const enabled = supported && (await deviceNotificationsEnabled());
        if (active) setEnabled(enabled);
      } catch (error) {
        if (active) setError(notificationError(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void check();
    window.addEventListener(notificationUpdate, check);
    return () => {
      active = false;
      window.removeEventListener(notificationUpdate, check);
    };
  }, []);
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
    <section className="device-notifications" aria-label="Device notifications">
      <h3>Notifications</h3>
      <p>
        {loading
          ? "Checking this device…"
          : !supported
            ? "Use a supported browser over HTTPS. On iPhone or iPad, add Nivra to your Home Screen and open it there."
            : enabled
              ? "Task and event reminders are enabled on this device."
              : "Get task and event reminders on this device."}
      </p>
      {supported && (
        <div className="device-notification-actions">
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => void toggle()}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {enabled ? "Disable on this device" : "Enable on this device"}
          </Button>
          {enabled && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                setStatus("");
                void api("calendar/subscriptions/test", { method: "POST" })
                  .then(() => setStatus("Test notification queued."))
                  .catch((error) => setError(notificationError(error)))
                  .finally(() => setBusy(false));
              }}
            >
              Send test notification
            </Button>
          )}
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
