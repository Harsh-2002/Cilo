"use client";
import { useId, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import {
  mcpClients,
  mcpClientSetup,
  type McpClient,
  type McpAuthentication,
} from "@/lib/mcp-client-setup";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
export function McpClientSetup({
  endpoint,
  copy,
  copied,
}: {
  endpoint: string;
  copy: (value: string) => Promise<void>;
  copied: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<McpClient>("codex");
  const [authentication, setAuthentication] =
    useState<McpAuthentication>("oauth");
  const setup = mcpClientSetup(client, authentication, endpoint);
  return (
    <section className="mcp-setup">
      <Button
        variant="ghost"
        className="mcp-setup-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Set up a client
        <ChevronDown size={16} className={open ? "mcp-setup-open" : ""} />
      </Button>
      {open && (
        <div id={id} className="mcp-setup-body">
          <div className="field">
            <Label htmlFor={`${id}-client`}>Client</Label>
            <Select
              value={client}
              onValueChange={(value) => setClient(value as McpClient)}
            >
              <SelectTrigger id={`${id}-client`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mcpClients.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="field">
            <Label>Authentication</Label>
            <div
              className="mcp-setup-auth"
              role="group"
              aria-label="Client authentication"
            >
              <Button
                variant="ghost"
                aria-pressed={authentication === "oauth"}
                onClick={() => setAuthentication("oauth")}
              >
                OAuth
              </Button>
              <Button
                variant="ghost"
                aria-pressed={authentication === "key"}
                onClick={() => setAuthentication("key")}
              >
                API key
              </Button>
            </div>
          </div>
          <p className="mcp-setup-hint">
            {setup.hint}
            {authentication === "key" &&
              " Create a key below if you don’t have one."}
          </p>
          {setup.snippets.map((snippet) => (
            <div className="mcp-setup-snippet" key={snippet.label}>
              <div>
                <span>{snippet.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Copy ${snippet.label}`}
                  onClick={() => void copy(snippet.value)}
                >
                  {copied === snippet.value ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                  {copied === snippet.value ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre tabIndex={0}>{snippet.value}</pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
