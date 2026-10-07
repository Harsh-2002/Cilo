"use client";
import { useEffect, useState } from "react";
import { Copy, Loader2, Plus, Unplug } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { useConfirm } from "./confirm-provider";
type Connections = {
  endpoint: string;
  keys: {
    id: string;
    name: string;
    start: string;
    permissions: string;
    expiresAt: number | null;
    lastUsed: number | null;
  }[];
  connections: { clientId: string; name: string | null }[];
};
export function AiConnections({
  onGuardChange,
  onSignOut,
}: {
  onGuardChange: (busy: boolean) => void;
  onSignOut: () => Promise<void>;
}) {
  const [data, setData] = useState<Connections | null>(null);
  const [name, setName] = useState("");
  const [full, setFull] = useState(false);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [clientForm, setClientForm] = useState(false);
  const [clientName, setClientName] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [publicClient, setPublicClient] = useState(false);
  const confirm = useConfirm();
  const load = () => api<Connections>("ai-connections").then(setData);
  useEffect(() => {
    let active = true;
    api<Connections>("ai-connections")
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    onGuardChange(busy);
    return () => onGuardChange(false);
  }, [busy, onGuardChange]);
  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setReauth(false);
    try {
      const result = await api<{
        key?: string;
        client_id?: string;
        client_secret?: string;
      }>("ai-connections", { method: "POST", body: JSON.stringify(body) });
      if (result.key) setSecret(result.key);
      if (result.client_id)
        setSecret(
          `Client ID: ${result.client_id}${result.client_secret ? `\nClient secret: ${result.client_secret}` : "\nPublic client · PKCE required"}`,
        );
      setCopied(false);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 403) setReauth(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Copy is unavailable. Select and copy the value below.");
    }
  }
  if (!data)
    return (
      <p role={error ? "alert" : "status"}>
        {error || "Loading AI connections…"}
      </p>
    );
  return (
    <div className="ai-connections">
      <div className="settings-section-heading">
        <h2>Connect your AI agents</h2>
        <p>
          Use OAuth with a hosted client, or an API key with a local agent. Both
          work with the same content you see here.
        </p>
      </div>
      <div className="field">
        <Label htmlFor="mcp-endpoint">MCP endpoint</Label>
        <div className="ai-copy-row">
          <Input id="mcp-endpoint" value={data.endpoint} readOnly />
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy MCP endpoint"
            onClick={() => void copy(data.endpoint)}
          >
            <Copy size={16} />
          </Button>
        </div>
      </div>
      <p className="field-hint">
        Choose OAuth in ChatGPT or Claude and enter this endpoint. A hosted
        client needs to reach your server over HTTPS.
      </p>
      {secret && (
        <section className="ai-secret" aria-label="New credential">
          <h3>Save this credential</h3>
          <p>It is only shown once. Keep it private.</p>
          <pre tabIndex={0}>{secret}</pre>
          <div className="ai-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy(secret)}
            >
              <Copy size={14} />
              Copy credential
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSecret("")}>
              I’ve saved it
            </Button>
          </div>
        </section>
      )}
      <form
        className="ai-key-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run({
              action: "create-key",
              name,
              access: full ? "full" : "read",
              ...(expires ? { expiresIn: Number(expires) * 86400 } : {}),
            })
          )
            setName("");
        }}
      >
        <h3>Create an API key</h3>
        <div className="field">
          <Label htmlFor="agent-key-name">Name</Label>
          <Input
            id="agent-key-name"
            placeholder="e.g. Local assistant"
            value={name}
            maxLength={80}
            required
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="field">
          <Label htmlFor="agent-key-expiry">
            Expires after <span className="field-hint">(optional, days)</span>
          </Label>
          <Input
            id="agent-key-expiry"
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            disabled={busy}
          />
        </div>
        <label className="check-row">
          <Checkbox
            checked={full}
            onCheckedChange={(v) => setFull(v === true)}
            disabled={busy}
          />
          Allow changes to content
        </label>
        <p className="field-hint">
          {full
            ? "Full access includes creating, editing, publishing and permanently deleting content. Account and server settings stay private."
            : "Read-only access lets the agent search and read your content."}
        </p>
        <Button type="submit" disabled={busy || !name.trim() || !!secret}>
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Plus size={15} />
          )}
          Create key
        </Button>
      </form>
      <section>
        <h3>API keys</h3>
        {!data.keys.length ? (
          <p className="field-hint">No API keys yet.</p>
        ) : (
          <ul className="ai-connection-list">
            {data.keys.map((key) => (
              <li key={key.id}>
                <div>
                  <strong>{key.name || "API key"}</strong>
                  <small>
                    {key.start}… ·{" "}
                    {key.permissions?.includes("write")
                      ? "Full content access"
                      : "Read only"}
                    {key.expiresAt
                      ? ` · Expires ${new Date(key.expiresAt).toLocaleDateString()}`
                      : ""}
                  </small>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Revoke this API key?",
                        description: "The agent will lose access immediately.",
                        action: "Revoke key",
                      })
                    )
                      void run({ action: "revoke-key", id: key.id });
                  }}
                >
                  <Unplug size={14} />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>OAuth connections</h3>
        {!data.connections.length ? (
          <p className="field-hint">
            Clients appear here after connecting with OAuth.
          </p>
        ) : (
          <ul className="ai-connection-list">
            {data.connections.map((client) => (
              <li key={client.clientId}>
                <div>
                  <strong>{client.name || "AI client"}</strong>
                  <small>{client.clientId}</small>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Disconnect this client?",
                        description:
                          "Its existing tokens will stop working immediately. It can reconnect with your consent.",
                        action: "Disconnect",
                      })
                    )
                      void run({
                        action: "revoke-oauth",
                        clientId: client.clientId,
                      });
                  }}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setClientForm(!clientForm)}
          disabled={busy}
        >
          Configure a client manually
        </Button>
        {clientForm && (
          <form
            className="ai-client-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                action: "create-client",
                name: clientName,
                redirectUri,
                public: publicClient,
              });
            }}
          >
            <div className="field">
              <Label htmlFor="oauth-client-name">Client name</Label>
              <Input
                id="oauth-client-name"
                value={clientName}
                required
                maxLength={80}
                onChange={(e) => setClientName(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field">
              <Label htmlFor="oauth-client-redirect">Exact callback URL</Label>
              <Input
                id="oauth-client-redirect"
                type="url"
                value={redirectUri}
                required
                onChange={(e) => setRedirectUri(e.target.value)}
                disabled={busy}
              />
            </div>
            <label className="check-row">
              <Checkbox
                checked={publicClient}
                onCheckedChange={(v) => setPublicClient(v === true)}
                disabled={busy}
              />
              Public client without a client secret
            </label>
            <Button disabled={busy || !!secret}>Register client</Button>
          </form>
        )}
      </section>
      {copied && (
        <p role="status" className="field-hint">
          Copied.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {reauth && (
        <Button variant="outline" onClick={() => void onSignOut()}>
          Sign out to sign in again
        </Button>
      )}
    </div>
  );
}
