"use client";
import { useEffect, useState } from "react";
import { api, authRequest } from "@/lib/client";
import { AuthScreen, Mark } from "./auth-screen";
import { LaunchScreen } from "./launch-screen";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
type Status = {
  setup: boolean;
  owner: unknown;
  methods: { password: boolean; passkey: boolean };
};
export function OAuthFlow({ consent = false }: { consent?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<string[]>([]);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function proceed(accept?: boolean) {
    setBusy(true);
    setError("");
    try {
      const query = window.location.search.slice(1);
      const result = await authRequest(
        consent ? "oauth2/consent" : "oauth2/continue",
        {
          oauth_query: query,
          ...(consent
            ? {
                accept,
                scope: scope
                  .filter((s) => s !== "nivra:write" || full)
                  .join(" "),
              }
            : {}),
        },
      );
      if (typeof (result.redirect_uri || result.url) !== "string")
        throw new Error(
          "Authorization could not continue. Start again from your AI client.",
        );
      window.location.assign(
        new URL(result.redirect_uri || result.url, window.location.href).href,
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const requested = (query.get("scope") || "")
      .split(" ")
      .filter((s) =>
        ["nivra:read", "nivra:write", "offline_access"].includes(s),
      );
    api<Status>("status")
      .then(async (v) => {
        if (!active) return;
        setScope(requested);
        setFull(requested.includes("nivra:write"));
        setStatus(v);
        if (v.owner && consent) {
          const info = await api<{ name: string }>(
            `ai-consent?client=${encodeURIComponent(query.get("client_id") || "")}`,
          );
          if (active) setName(info.name);
        } else if (v.owner && !consent) {
          const result = await authRequest("oauth2/continue", {
            oauth_query: window.location.search.slice(1),
          });
          if (active && typeof (result.redirect_uri || result.url) === "string")
            window.location.assign(
              new URL(result.redirect_uri || result.url, window.location.href)
                .href,
            );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [consent]);
  if (!status && !error) return <LaunchScreen />;
  if (status && !status.owner && !status.setup)
    return (
      <>
        <AuthScreen
          setup={false}
          methods={status.methods}
          onReady={() => {
            void authRequest("oauth2/continue", {
              oauth_query: window.location.search.slice(1),
            })
              .then((result) => {
                if (typeof (result.redirect_uri || result.url) === "string")
                  window.location.assign(
                    new URL(
                      result.redirect_uri || result.url,
                      window.location.href,
                    ).href,
                  );
              })
              .catch((e) => setError(e.message));
          }}
        />
        {error && (
          <p className="oauth-error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  return (
    <main className="auth-page">
      <section className="auth-panel oauth-card">
        <Mark />
        <h1>{consent ? "Connect to Nivra" : "Continue to your AI client"}</h1>
        {consent && name && (
          <>
            <p className="auth-description">
              <strong>{name}</strong> is requesting access to your personal
              brain.
            </p>
            <p>
              It can search and read your notes, journals, tasks, bookmarks,
              artifacts and files.
            </p>
            {scope.includes("nivra:write") && (
              <label className="check-row">
                <Checkbox
                  checked={full}
                  onCheckedChange={(v) => setFull(v === true)}
                  disabled={busy}
                />
                Read & write
              </label>
            )}
            {full && (
              <p className="field-hint">
                Read, create, edit, publish, and move items to Trash. Agents
                cannot restore or permanently delete items. Account security and
                server settings remain private.
              </p>
            )}
            <p className="field-hint">
              You can disconnect this client in Settings → MCP.
            </p>
            <div className="ai-actions">
              <Button
                variant="outline"
                onClick={() => void proceed(false)}
                disabled={busy}
              >
                Deny
              </Button>
              <Button onClick={() => void proceed(true)} disabled={busy}>
                {busy ? "Connecting…" : "Allow access"}
              </Button>
            </div>
          </>
        )}
        {status?.setup && (
          <p>Set up your Nivra account before connecting an AI client.</p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {(!consent || status?.setup) && (
          <Button
            variant="outline"
            onClick={() =>
              window.location.assign(new URL("/", window.location.href).href)
            }
          >
            Return to Nivra
          </Button>
        )}
      </section>
    </main>
  );
}
