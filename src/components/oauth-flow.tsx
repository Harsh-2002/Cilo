"use client";
import { useEffect, useState } from "react";
import { api, authRequest } from "@/lib/client";
import { AuthScreen, Mark } from "./auth-screen";
import { LaunchScreen } from "./launch-screen";
import { Button } from "./ui/button";
import { Check } from "lucide-react";
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
        if (
          requested.includes("nivra:write") &&
          !requested.includes("nivra:read")
        )
          throw new Error(
            "This client must request read access together with write access. Start a new connection from your client.",
          );
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
        <header className="oauth-heading">
          <Mark />
          <h1>
            {error && !name
              ? "Connection couldn’t continue"
              : consent
                ? "Connect to Nivra"
                : "Continue to your client"}
          </h1>
          {consent && name && (
            <p>
              <strong>{name}</strong> is requesting access to your content.
            </p>
          )}
        </header>
        {consent && name && (
          <>
            <section
              className="oauth-access"
              aria-labelledby="oauth-access-label"
            >
              <h2 id="oauth-access-label">Access</h2>
              <div
                className="oauth-access-switch"
                role="group"
                aria-labelledby="oauth-access-label"
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={!full}
                  disabled={busy}
                  onClick={() => setFull(false)}
                >
                  <Check aria-hidden="true" className="oauth-selection-mark" />
                  Read
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={full}
                  disabled={busy || !scope.includes("nivra:write")}
                  onClick={() => setFull(true)}
                >
                  <Check aria-hidden="true" className="oauth-selection-mark" />
                  Read &amp; write
                </Button>
              </div>
              <ul className="oauth-access-summary" aria-live="polite">
                <li>Search and read your content.</li>
                <li>
                  {full
                    ? "Create, edit, publish and move items to Trash."
                    : "No changes to your content."}
                </li>
              </ul>
              {!scope.includes("nivra:write") && (
                <p className="field-hint">
                  This client requested read access only.
                </p>
              )}
            </section>
            <p className="oauth-note">
              Only you can restore or permanently delete items in Trash.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <footer className="oauth-footer">
              <div className="oauth-decisions">
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
              <p>You can disconnect anytime in Settings → MCP.</p>
            </footer>
          </>
        )}
        {status?.setup && (
          <p>Set up your Nivra account before connecting an AI client.</p>
        )}
        {error && !name && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {error && !name && (
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
