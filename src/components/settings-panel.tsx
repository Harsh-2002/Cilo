"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Loader2,
  Sun,
  Moon,
  Monitor,
  ArrowUpRight,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { RecoveryCard } from "./auth-screen";
import { api, authRequest, downloadRequest } from "@/lib/client";
import type { Owner, Settings } from "@/lib/types";

export function SettingsPanel({
  open,
  onClose,
  owner,
  initial,
  beforeAction,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  owner: Owner;
  initial: Settings;
  beforeAction: () => Promise<boolean>;
  onImported: () => Promise<void>;
}) {
  const [tab, setTab] = useState("appearance");
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(owner.name);
  const [username, setUsername] = useState(owner.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [limit, setLimit] = useState(initial.uploadLimit / 1024 / 1024);
  const { theme, setTheme } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  const bundleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open)
      api<Settings>("settings")
        .then((result) => {
          setSettings(result);
          setLimit(result.uploadLimit / 1024 / 1024);
        })
        .catch((e) => setError(e.message));
  }, [open]);
  async function run(action: () => Promise<void>) {
    if (!(await beforeAction())) {
      setError("Save your current note before continuing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function appearance(value: Settings["theme"]) {
    await run(async () => {
      const result = await api<Settings>("settings", {
        method: "PATCH",
        body: JSON.stringify({ ...settings, theme: value }),
      });
      setSettings(result);
      setTheme(value);
    });
  }
  async function markdownImport(file: File) {
    await run(async () => {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Markdown files must be smaller than 8 MiB.");
      const { markdownDocument } = await import("./editor");
      const content = await markdownDocument(await file.text());
      await api("notes", {
        method: "POST",
        body: JSON.stringify({
          title: file.name.replace(/\.(md|markdown)$/i, ""),
          document: content,
        }),
      });
      await onImported();
      toast.success("Markdown note imported.");
    });
  }
  async function bundleImport(file: File) {
    await run(async () => {
      const result = await api<{ imported: number }>("import/bundle", {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/zip" },
      });
      await onImported();
      toast.success(
        `${result.imported} notes imported. Existing notes were kept.`,
      );
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy && !code) {
          setCurrentPassword("");
          setNewPassword("");
          setConfirm("");
          setError("");
          onClose();
        }
      }}
    >
      <DialogContent className="settings-dialog" showCloseButton={!code}>
        {code ? (
          <div className="settings-recovery">
            <RecoveryCard
              code={code}
              onDone={() => setCode("")}
              doneLabel="Back to settings"
            />
          </div>
        ) : (
          <>
            <header>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Make Cilo work the way you do.
              </DialogDescription>
            </header>
            <div className="settings-layout">
              <nav aria-label="Settings sections">
                {[
                  { id: "appearance", label: "Appearance" },
                  { id: "account", label: "Account" },
                  { id: "data", label: "Files & data" },
                  { id: "about", label: "About" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? "active" : ""}
                    onClick={() => {
                      setTab(item.id);
                      setError("");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <section className="settings-content">
                {tab === "appearance" && (
                  <>
                    <h2>Appearance</h2>
                    <p className="settings-description">
                      A little less distraction. A little more you.
                    </p>
                    <div className="theme-options">
                      {(
                        [
                          { value: "light", Icon: Sun, label: "Light" },
                          { value: "dark", Icon: Moon, label: "Dark" },
                          { value: "system", Icon: Monitor, label: "System" },
                        ] as const
                      ).map(({ value, Icon, label }) => (
                        <button
                          type="button"
                          disabled={busy}
                          key={value}
                          aria-pressed={theme === value}
                          className={theme === value ? "selected" : ""}
                          onClick={() => void appearance(value)}
                        >
                          <Icon size={22} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="settings-row">
                      <div>
                        <h3>Install Cilo</h3>
                        <p>
                          Use your browser’s install option. On iPhone or iPad,
                          open Safari’s Share menu and choose Add to Home
                          Screen.
                        </p>
                      </div>
                      <Smartphone size={22} />
                    </div>
                    <p className="field-hint">
                      Notes need a connection in this release. Unsaved edits
                      stay in the open tab while you reconnect.
                    </p>
                  </>
                )}
                {tab === "account" && (
                  <>
                    <h2>Your account</h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await authRequest("update-user", { name, username });
                          toast.success("Account updated.");
                        });
                      }}
                      className="settings-form"
                    >
                      <div className="field">
                        <Label htmlFor="profile-name">Name</Label>
                        <Input
                          id="profile-name"
                          value={name}
                          maxLength={80}
                          required
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <Label htmlFor="profile-username">Username</Label>
                        <Input
                          id="profile-username"
                          value={username}
                          minLength={3}
                          maxLength={30}
                          pattern="[a-zA-Z0-9_.]+"
                          required
                          onChange={(e) => setUsername(e.target.value)}
                        />
                      </div>
                      <Button type="submit" variant="outline" disabled={busy}>
                        Save account
                      </Button>
                    </form>
                    <div className="settings-divider" />
                    <h3>Change password</h3>
                    <form
                      className="settings-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newPassword !== confirm) {
                          setError("Your passwords don’t match.");
                          return;
                        }
                        void run(async () => {
                          await authRequest("change-password", {
                            currentPassword,
                            newPassword,
                            revokeOtherSessions: true,
                          });
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirm("");
                          toast.success(
                            "Password changed. Other sessions were signed out.",
                          );
                        });
                      }}
                    >
                      <div className="field">
                        <Label htmlFor="current-password">
                          Current password
                        </Label>
                        <Input
                          id="current-password"
                          type="password"
                          autoComplete="current-password"
                          value={currentPassword}
                          required
                          onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <Label htmlFor="new-password">New password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          autoComplete="new-password"
                          minLength={12}
                          maxLength={128}
                          value={newPassword}
                          required
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <Label htmlFor="confirm-password">
                          Confirm new password
                        </Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          autoComplete="new-password"
                          value={confirm}
                          required
                          onChange={(e) => setConfirm(e.target.value)}
                        />
                      </div>
                      <Button variant="outline" type="submit" disabled={busy}>
                        Change password
                      </Button>
                    </form>
                    <div className="settings-divider" />
                    <div className="settings-row">
                      <div>
                        <h3>Other sessions</h3>
                        <p>Sign out every other browser and device.</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await authRequest("revoke-other-sessions", {});
                            toast.success("Other sessions signed out.");
                          })
                        }
                      >
                        Sign out others
                      </Button>
                    </div>
                    <div className="settings-divider" />
                    <h3>Recovery code</h3>
                    <p className="settings-description">
                      Replace your saved code. Your old code will stop working.
                    </p>
                    <div className="field">
                      <Label htmlFor="recovery-password">
                        Confirm your current password
                      </Label>
                      <Input
                        id="recovery-password"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy || !currentPassword}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{ recoveryCode: string }>(
                            "settings/recovery",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                password: currentPassword,
                              }),
                            },
                          );
                          setCode(result.recoveryCode);
                          setCurrentPassword("");
                        })
                      }
                    >
                      <ShieldCheck size={15} />
                      Generate new code
                    </Button>
                  </>
                )}
                {tab === "data" && (
                  <>
                    <h2>Files & data</h2>
                    <form
                      className="settings-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          setSettings(
                            await api<Settings>("settings", {
                              method: "PATCH",
                              body: JSON.stringify({
                                ...settings,
                                uploadLimit: limit * 1024 * 1024,
                              }),
                            }),
                          );
                          toast.success("Attachment limit updated.");
                        });
                      }}
                    >
                      <div className="field">
                        <Label htmlFor="upload-limit">
                          Maximum attachment size (MiB)
                        </Label>
                        <Input
                          id="upload-limit"
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={limit}
                          onChange={(e) => setLimit(Number(e.target.value))}
                          required
                        />
                        <p className="field-hint">
                          Applies to new uploads. Files stay on your server.
                        </p>
                      </div>
                      <Button variant="outline" disabled={busy} type="submit">
                        Save limit
                      </Button>
                    </form>
                    <div className="settings-divider" />
                    <div className="settings-row">
                      <div>
                        <h3>Import Markdown</h3>
                        <p>Bring a .md file into your note collection.</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => importRef.current?.click()}
                      >
                        <Upload size={14} />
                        Import
                      </Button>
                    </div>
                    <div className="settings-divider" />
                    <div className="settings-row">
                      <div>
                        <h3>Export your notes</h3>
                        <p>
                          A lossless Cilo bundle with tags, drawings, and files.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await downloadRequest(
                              "export/bundle",
                              `cilo-${new Date().toISOString().slice(0, 10)}.zip`,
                            );
                          })
                        }
                      >
                        <Download size={14} />
                        Export
                      </Button>
                    </div>
                    <div className="settings-row">
                      <div>
                        <h3>Import a Cilo bundle</h3>
                        <p>
                          Add exported notes without replacing existing ones.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => bundleRef.current?.click()}
                      >
                        <Upload size={14} />
                        Import
                      </Button>
                    </div>
                    <p className="field-hint">
                      Markdown packages preserve portable text, diagram source,
                      drawing previews, and editable drawing sidecars. Some rich
                      formatting may be simplified. Cilo bundles preserve the
                      full document.
                    </p>
                    <input
                      ref={importRef}
                      type="file"
                      className="hidden"
                      accept=".md,.markdown,text/markdown"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void markdownImport(file);
                        e.target.value = "";
                      }}
                    />
                    <input
                      ref={bundleRef}
                      type="file"
                      className="hidden"
                      accept=".zip,application/zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void bundleImport(file);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
                {tab === "about" && (
                  <>
                    <h2>Cilo</h2>
                    <p className="settings-description">
                      A quiet place to think, write, and remember.
                    </p>
                    <div className="about-details">
                      <p>
                        <span>Version</span>
                        <strong>0.1.0</strong>
                      </p>
                      <p>
                        <span>Workspace</span>
                        <strong>Personal</strong>
                      </p>
                      <p>
                        <span>Storage</span>
                        <strong>Local filesystem</strong>
                      </p>
                      <p>
                        <span>License</span>
                        <strong>MIT</strong>
                      </p>
                    </div>
                    <p className="settings-description">
                      Inspired by Clio, the Greek Muse of history and recording.
                      Built for your own server, with your ideas at the center.
                    </p>
                    <a
                      className="source-link"
                      href="https://github.com/Harsh-2002/Cilo"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source code
                      <ArrowUpRight size={15} />
                    </a>
                  </>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {busy && (
                  <div className="settings-busy" role="status">
                    <Loader2 size={14} className="animate-spin" />
                    Working…
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
