"use client";
import { BackupSettings } from "./backup-settings";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { FeedbackOutlet } from "./inline-feedback";
import { notify } from "@/lib/feedback";
import {
  Download,
  Upload,
  Loader2,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  ArrowLeft,
  FolderOpen,
  Check,
  FileText,
  LogOut,
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
import { MfaSettings } from "./mfa-settings";
import { RecoveryCard } from "./auth-screen";
import { api, authRequest, downloadRequest } from "@/lib/client";
import { importFiles, type ImportResult } from "@/lib/import-files";
import type { Owner, Settings } from "@/lib/types";

type Section = "appearance" | "account" | "data";
type AccountView = "profile" | "password" | "recovery" | "mfa";
export function SettingsPanel({
  open,
  onClose,
  owner,
  initial,
  beforeAction,
  onImported,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  owner: Owner;
  initial: Settings;
  beforeAction: () => Promise<boolean>;
  onImported: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Section>("appearance");
  const [accountView, setAccountView] = useState<AccountView>("profile");
  const [busy, setBusy] = useState(false);
  const [mfaGuard, setMfaGuard] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(
    Boolean(initial.twoFactorEnabled),
  );
  const [error, setError] = useState("");
  const [name, setName] = useState(owner.name);
  const [username, setUsername] = useState(owner.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [selection, setSelection] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [currentFile, setCurrentFile] = useState("");
  const { theme, setTheme } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const bundleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open)
      api<{ owner: Owner | null; settings: Settings | null }>("status")
        .then((result) => {
          setMfaEnabled(Boolean(result.settings?.twoFactorEnabled));
          if (result.owner) {
            setName(result.owner.name);
            setUsername(result.owner.username);
          }
        })
        .catch((e) => setError(e.message));
  }, [open]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      if (!(await beforeAction()))
        throw new Error("Save your current note before continuing.");
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function close() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setError("");
    setAccountView("profile");
    onClose();
  }
  function select(files: File[]) {
    setSelection(files);
    setResults([]);
    setError("");
  }
  async function startImport() {
    await run(async () => {
      const { markdownDocument } = await import("./editor");
      const imported = await importFiles(
        selection,
        markdownDocument,
        (items, current) => {
          setResults(items);
          setCurrentFile(current);
        },
      );
      setSelection([]);
      setCurrentFile("");
      await onImported();
      const count = imported.filter((item) => item.ok).length;
      if (count)
        notify.success(`${count} ${count === 1 ? "note" : "notes"} imported.`);
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy && !code && !mfaGuard) close();
      }}
    >
      <DialogContent
        className="settings-dialog"
        showCloseButton={!code && !mfaGuard}
        onEscapeKeyDown={(e) => {
          if (busy || code || mfaGuard) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy || code || mfaGuard) e.preventDefault();
        }}
      >
        {code ? (
          <div className="settings-recovery">
            <RecoveryCard
              code={code}
              onDone={() => {
                setCode("");
                setAccountView("profile");
              }}
              doneLabel="Back to settings"
            />
          </div>
        ) : (
          <>
            <header>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Your space, the way you like it.
              </DialogDescription>
            </header>
            <div
              className="settings-tabs"
              role="tablist"
              aria-label="Settings sections"
            >
              {(
                [
                  { id: "appearance", label: "Appearance" },
                  { id: "account", label: "Account" },
                  { id: "data", label: "Import & export" },
                ] as const
              ).map((item, index, items) => (
                <button
                  key={item.id}
                  id={`settings-tab-${item.id}`}
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`settings-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  disabled={busy || mfaGuard}
                  onClick={() => {
                    setTab(item.id);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? items.length - 1
                            : (index +
                                (e.key === "ArrowRight" ? 1 : -1) +
                                items.length) %
                              items.length;
                      setTab(items[next].id);
                      document
                        .getElementById(`settings-tab-${items[next].id}`)
                        ?.focus();
                    }
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <section
              className="settings-content"
              role="tabpanel"
              id={`settings-panel-${tab}`}
              aria-labelledby={`settings-tab-${tab}`}
              tabIndex={0}
            >
              <FeedbackOutlet />
              {tab === "appearance" && (
                <>
                  <div className="settings-section-heading">
                    <h2>Color theme</h2>
                    <p>Choose a look, or follow your device.</p>
                  </div>
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
                        disabled={busy || mfaGuard}
                        key={value}
                        aria-pressed={(theme || initial.theme) === value}
                        className={
                          (theme || initial.theme) === value ? "selected" : ""
                        }
                        onClick={() =>
                          void run(async () => {
                            await api("settings", {
                              method: "PATCH",
                              body: JSON.stringify({ theme: value }),
                            });
                            setTheme(value);
                          })
                        }
                      >
                        <Icon size={21} />
                        <span>{label}</span>
                        {theme === value && (
                          <Check className="theme-check" size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="settings-footnote">
                    Your choice is saved for this browser and used as your
                    workspace default.
                  </p>
                </>
              )}
              {tab === "account" && (
                <>
                  {accountView !== "profile" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="settings-back"
                      disabled={busy || mfaGuard}
                      onClick={() => {
                        setAccountView("profile");
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirm("");
                        setError("");
                      }}
                    >
                      <ArrowLeft size={14} />
                      Account
                    </Button>
                  )}
                  {accountView === "profile" && (
                    <>
                      <form
                        className="settings-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await authRequest("update-user", {
                              name,
                              username,
                            });
                            notify.success("Account updated.");
                          });
                        }}
                      >
                        <div className="settings-profile-fields">
                          <div className="field">
                            <Label htmlFor="settings-name">Name</Label>
                            <Input
                              id="settings-name"
                              value={name}
                              required
                              maxLength={80}
                              onChange={(e) => setName(e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <Label htmlFor="settings-username">Username</Label>
                            <Input
                              id="settings-username"
                              value={username}
                              required
                              minLength={3}
                              maxLength={32}
                              autoCapitalize="none"
                              autoComplete="username"
                              onChange={(e) => setUsername(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button
                          type="submit"
                          variant="outline"
                          disabled={busy || mfaGuard}
                        >
                          Save account
                        </Button>
                      </form>
                      <div className="settings-security">
                        <button
                          disabled={busy || mfaGuard}
                          onClick={() => setAccountView("password")}
                        >
                          <span>
                            <strong>Password</strong>
                            <small>Change your sign-in password.</small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        <button
                          disabled={busy || mfaGuard}
                          onClick={() => setAccountView("mfa")}
                        >
                          <span>
                            <strong>Two-factor authentication</strong>
                            <small>
                              {mfaEnabled
                                ? "Enabled · authenticator required at sign-in."
                                : "Optional extra protection with an authenticator."}
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        <button
                          disabled={busy || mfaGuard}
                          onClick={() => setAccountView("recovery")}
                        >
                          <span>
                            <strong>Recovery code</strong>
                            <small>
                              Replace the code you use to recover access.
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        <div className="settings-row">
                          <div>
                            <h3>Other sessions</h3>
                            <p>Sign out your other browsers and devices.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || mfaGuard}
                            onClick={() =>
                              void run(async () => {
                                await authRequest("revoke-other-sessions", {});
                                notify.success("Other sessions signed out.");
                              })
                            }
                          >
                            Sign out others
                          </Button>
                        </div>
                        <div className="settings-row">
                          <div>
                            <h3>This session</h3>
                            <p>Sign out of this browser.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || mfaGuard}
                            onClick={() => void run(onSignOut)}
                          >
                            <LogOut size={15} />
                            Sign out
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                  {accountView === "password" && (
                    <>
                      <div className="settings-section-heading">
                        <h2>Change password</h2>
                        <p>Use at least 12 characters.</p>
                      </div>
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
                            setAccountView("profile");
                            notify.success(
                              "Password changed. Other sessions were signed out.",
                            );
                          });
                        }}
                      >
                        {[
                          {
                            id: "current-password",
                            label: "Current password",
                            value: currentPassword,
                            set: setCurrentPassword,
                            autocomplete: "current-password",
                          },
                          {
                            id: "new-password",
                            label: "New password",
                            value: newPassword,
                            set: setNewPassword,
                            autocomplete: "new-password",
                          },
                          {
                            id: "confirm-password",
                            label: "Confirm new password",
                            value: confirm,
                            set: setConfirm,
                            autocomplete: "new-password",
                          },
                        ].map((field) => (
                          <div className="field" key={field.id}>
                            <Label htmlFor={field.id}>{field.label}</Label>
                            <Input
                              id={field.id}
                              type="password"
                              autoComplete={field.autocomplete}
                              value={field.value}
                              minLength={
                                field.id === "current-password" ? undefined : 12
                              }
                              maxLength={128}
                              required
                              onChange={(e) => field.set(e.target.value)}
                            />
                          </div>
                        ))}
                        <Button type="submit" disabled={busy || mfaGuard}>
                          Update password
                        </Button>
                      </form>
                    </>
                  )}
                  {accountView === "mfa" && (
                    <MfaSettings
                      enabled={mfaEnabled}
                      beforeAction={beforeAction}
                      onChanged={setMfaEnabled}
                      onGuardChange={setMfaGuard}
                    />
                  )}
                  {accountView === "recovery" && (
                    <>
                      <div className="settings-section-heading">
                        <h2>Replace recovery code</h2>
                        <p>
                          Your existing code will stop working. Save the new one
                          somewhere safe.
                        </p>
                      </div>
                      <form
                        className="settings-form"
                        onSubmit={(e) => {
                          e.preventDefault();
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
                          });
                        }}
                      >
                        <div className="field">
                          <Label htmlFor="recovery-password">
                            Current password
                          </Label>
                          <Input
                            id="recovery-password"
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            required
                            onChange={(e) => setCurrentPassword(e.target.value)}
                          />
                        </div>
                        <Button
                          type="submit"
                          disabled={busy || !currentPassword}
                        >
                          Generate new code
                        </Button>
                      </form>
                    </>
                  )}
                </>
              )}
              {tab === "data" && (
                <>
                  <div className="settings-section-heading">
                    <h2>Bring your notes</h2>
                    <p>
                      Import Markdown, images, and files together. Choose a
                      folder to keep relative attachment links.
                    </p>
                  </div>
                  <div className="import-choices">
                    <Button
                      variant="outline"
                      disabled={busy || mfaGuard}
                      onClick={() => importRef.current?.click()}
                    >
                      <Upload size={15} />
                      Choose files
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || mfaGuard}
                      onClick={() => folderRef.current?.click()}
                    >
                      <FolderOpen size={15} />
                      Choose folder
                    </Button>
                  </div>
                  {selection.length > 0 && (
                    <div className="import-selection">
                      <div className="import-selection-heading">
                        <strong>
                          {selection.length}{" "}
                          {selection.length === 1 ? "file" : "files"} selected
                        </strong>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || mfaGuard}
                          onClick={() => setSelection([])}
                        >
                          Clear
                        </Button>
                      </div>
                      <ul>
                        {selection.slice(0, 4).map((file, i) => (
                          <li key={i}>
                            <FileText size={14} />
                            <span>{file.webkitRelativePath || file.name}</span>
                          </li>
                        ))}
                      </ul>
                      {selection.length > 4 && (
                        <p className="field-hint">
                          And {selection.length - 4} more
                        </p>
                      )}
                      <Button
                        disabled={busy || mfaGuard}
                        onClick={() => void startImport()}
                      >
                        {busy ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Upload size={15} />
                        )}
                        Import {selection.length}{" "}
                        {selection.length === 1 ? "file" : "files"}
                      </Button>
                    </div>
                  )}
                  {(results.length > 0 || currentFile) && (
                    <div className="import-results" aria-live="polite">
                      <strong>
                        {currentFile
                          ? `Importing ${currentFile}…`
                          : `${results.filter((item) => item.ok).length} imported${results.some((item) => !item.ok) ? ` · ${results.filter((item) => !item.ok).length} failed` : ""}`}
                      </strong>
                      {results
                        .filter((item) => !item.ok)
                        .map((item, i) => (
                          <p key={i}>
                            {item.name}: {item.error}
                          </p>
                        ))}
                    </div>
                  )}
                  <div className="settings-data-actions">
                    <div className="settings-row">
                      <div>
                        <h3>Export everything</h3>
                        <p>
                          A Nivra bundle with notes, tasks, bookmarks, tags,
                          drawings, and attachments.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || mfaGuard}
                        onClick={() =>
                          void run(() =>
                            downloadRequest(
                              "export/bundle",
                              `nivra-${new Date().toISOString().slice(0, 10)}.zip`,
                            ),
                          )
                        }
                      >
                        <Download size={14} />
                        Export
                      </Button>
                    </div>
                    <div className="settings-row">
                      <div>
                        <h3>Restore a Nivra bundle</h3>
                        <p>
                          Add exported content alongside your existing notes and
                          tasks. Existing bookmark URLs are kept.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || mfaGuard}
                        onClick={() => bundleRef.current?.click()}
                      >
                        <Upload size={14} />
                        Import
                      </Button>
                    </div>
                  </div>
                  <input
                    ref={importRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      select(Array.from(e.target.files || []));
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={folderRef}
                    type="file"
                    multiple
                    {...{ webkitdirectory: "" }}
                    className="hidden"
                    onChange={(e) => {
                      select(Array.from(e.target.files || []));
                      e.target.value = "";
                    }}
                  />
                  <BackupSettings beforeAction={beforeAction} />
                  <input
                    ref={bundleRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(async () => {
                          const result = await api<{
                            imported: number;
                            importedTasks?: number;
                            importedBookmarks?: number;
                            dailyConflicts?: number;
                          }>("import/bundle", {
                            method: "POST",
                            body: file,
                            headers: { "Content-Type": "application/zip" },
                          });
                          await onImported();
                          notify.success(
                            `${result.imported} notes${result.importedTasks ? ` and ${result.importedTasks} tasks` : ""}${result.importedBookmarks ? ` and ${result.importedBookmarks} bookmarks` : ""} restored.`,
                          );
                          if (result.dailyConflicts)
                            notify.info(
                              `${result.dailyConflicts} daily notes were imported as regular notes because those days already exist.`,
                            );
                        });
                      e.target.value = "";
                    }}
                  />
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {busy && !currentFile && (
                <p className="settings-status" role="status">
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </p>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
