"use client";
import { useEffect, useState } from "react";
import { api, authRequest } from "@/lib/client";
import { AuthScreen, Mark } from "./auth-screen";
import { LaunchScreen } from "./launch-screen";
import { Button } from "./ui/button";
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
  const requiresLogin =
    typeof window !== "undefined" &&
    !consent &&
    (new URLSearchParams(window.location.search)
      .get("prompt")
      ?.split(" ")
      .includes("login") ||
      new URLSearchParams(window.location.search).has("max_age"));
  async function proceed(accept?: boolean) {
    setBusy(true);
    setError("");
    try {
      const query = window.location.search.slice(1);
      const result = await authRequest(
        consent ? "oauth2/consent" : "oauth2/continue",
        {
          oauth_query: query,
          ...(!consent ? { postLogin: true } : {}),
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
        setFull(false);
        setStatus(v);
        if (v.owner && consent) {
          const info = await api<{ name: string }>(
            `ai-consent?client=${encodeURIComponent(query.get("client_id") || "")}`,
          );
          if (active) setName(info.name);
        } else if (v.owner && !consent && !requiresLogin) {
          const result = await authRequest("oauth2/continue", {
            oauth_query: window.location.search.slice(1),
            postLogin: true,
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
  }, [consent, requiresLogin]);
  if (!status && !error) return <LaunchScreen />;
  if (status && (!status.owner || requiresLogin) && !status.setup)
    return (
      <AuthScreen
        setup={false}
        methods={status.methods}
        continuationError={error}
        oauthQuery={window.location.search.slice(1)}
        onReady={(result) => {
          setError("");
          if (typeof (result?.redirect_uri || result?.url) === "string") {
            window.location.assign(
              new URL(
                result?.redirect_uri || result?.url || "",
                window.location.href,
              ).href,
            );
            return;
          }
          void authRequest("oauth2/continue", {
            oauth_query: window.location.search.slice(1),
            postLogin: true,
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
    );
  return (
    <main className="auth-page">
      <section className="auth-panel oauth-card">
        <Mark />
        <h1>
          {error
            ? "Connection couldn’t continue"
            : consent
              ? "Connect to Nivra"
              : "Continue to your client"}
        </h1>
        {consent && name && (
          <>
            <p className="auth-description">
              <strong>{name}</strong> is requesting access to your personal
              brain.
            </p>
            <div className="field">
              <span id="oauth-access-label">Access</span>
              <div
                className="ai-actions"
                role="group"
                aria-labelledby="oauth-access-label"
              >
                <Button
                  type="button"
                  variant={full ? "outline" : "default"}
                  aria-pressed={!full}
                  disabled={busy}
                  onClick={() => setFull(false)}
                >
                  Read
                </Button>
                <Button
                  type="button"
                  variant={full ? "default" : "outline"}
                  aria-pressed={full}
                  disabled={busy || !scope.includes("nivra:write")}
                  onClick={() => setFull(true)}
                >
                  Read &amp; write
                </Button>
              </div>
              <p className="field-hint">
                {full
                  ? "Read, create, edit, publish, and move items to Trash."
                  : "Search and read content. No changes allowed."}
              </p>
              {!scope.includes("nivra:write") && (
                <p className="field-hint">
                  This client requested read access only.
                </p>
              )}
            </div>
            <p className="field-hint">
              Trash is read-only for agents. Only you can restore or permanently
              delete items.
            </p>
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
        {error && (
          <p className="field-hint">
            Start a new connection from your MCP client. Your Nivra account
            stays signed in.
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
