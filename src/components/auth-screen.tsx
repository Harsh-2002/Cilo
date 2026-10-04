"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, authRequest, download } from "@/lib/client";
import type { Settings } from "@/lib/types";

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          d="M28 11a12 12 0 1 0 0 18"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M29 19h-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
export function RecoveryCard({
  code,
  onDone,
  doneLabel = "Continue",
}: {
  code: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="step-symbol">
        <Check size={23} />
      </div>
      <h1>Keep your way back in.</h1>
      <p className="auth-description">
        Your recovery code lets you reset your password. Save it somewhere safe
        — it’s only shown once.
      </p>
      <code className="recovery-code">{code}</code>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          download(
            new Blob(
              [
                `Cilo recovery code\n\n${code}\n\nKeep this private. Using it resets your password and replaces the code.\n`,
              ],
              { type: "text/plain" },
            ),
            "cilo-recovery-code.txt",
          );
          setSaved(true);
        }}
      >
        <Download size={16} />
        Download recovery code
      </Button>
      <label className="check-row">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved my recovery code
      </label>
      <Button className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
        <ArrowRight size={16} />
      </Button>
    </>
  );
}
export function AuthScreen({
  setup,
  onReady,
}: {
  setup: boolean;
  onReady: () => void;
}) {
  const [step, setStep] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { theme, setTheme } = useTheme();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if ((setup || recovering) && password !== confirm) {
      setError("Your passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      if (setup) {
        const result = await api<{ recoveryCode: string }>("setup", {
          method: "POST",
          body: JSON.stringify({ name, username, password }),
        });
        setRecoveryCode(result.recoveryCode);
        setPassword("");
        setConfirm("");
        setStep(1);
      } else if (recovering) {
        const result = await api<{ recoveryCode: string }>("recover", {
          method: "POST",
          body: JSON.stringify({ code, password }),
        });
        setRecoveryCode(result.recoveryCode);
        setPassword("");
        setConfirm("");
        setStep(1);
      } else {
        await authRequest("sign-in/username", { username, password });
        onReady();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await api<Settings>("settings", {
        method: "PATCH",
        body: JSON.stringify({
          theme: theme || "system",
          uploadLimit: 25 * 1024 * 1024,
        }),
      });
      onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <header className="auth-brand">
        <Mark small />
        <span>Cilo</span>
      </header>
      <section className="auth-panel">
        {setup && (
          <div
            className="setup-progress"
            aria-label={`Setup step ${step + 1} of 3`}
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className={i <= step ? "complete" : ""} />
            ))}
          </div>
        )}
        {step === 1 ? (
          <RecoveryCard
            code={recoveryCode}
            onDone={() => {
              if (setup) setStep(2);
              else {
                setStep(0);
                setRecovering(false);
                setCode("");
              }
            }}
            doneLabel={setup ? "Make it yours" : "Back to sign in"}
          />
        ) : step === 2 ? (
          <>
            <h1>A space that feels like you.</h1>
            <p className="auth-description">
              Choose your appearance. You can change this anytime in settings.
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
                  key={value}
                  aria-pressed={theme === value}
                  className={theme === value ? "selected" : ""}
                  onClick={() => setTheme(value)}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={busy} onClick={finish}>
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  Start writing
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <Mark />
            <h1>
              {setup
                ? "A quiet place to think."
                : recovering
                  ? "Find your way back."
                  : "Welcome back."}
            </h1>
            <p className="auth-description">
              {setup
                ? "Your notes, ideas, and everything in between. Let’s make this space yours."
                : recovering
                  ? "Use your saved recovery code to set a new password."
                  : "Pick up where your thoughts left off."}
            </p>
            <form onSubmit={submit} className="auth-form">
              {setup && (
                <div className="field">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                    autoComplete="name"
                    placeholder="How should we call you?"
                  />
                </div>
              )}
              {recovering ? (
                <div className="field">
                  <Label htmlFor="recovery">Recovery code</Label>
                  <Input
                    id="recovery"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="Your saved recovery code"
                  />
                </div>
              ) : (
                <div className="field">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_.]+"
                    autoComplete="username"
                    placeholder="Choose a username"
                  />
                  {setup && (
                    <p className="field-hint">
                      Letters, numbers, dots, and underscores.
                    </p>
                  )}
                </div>
              )}
              <div className="field">
                <Label htmlFor="password">
                  {recovering ? "New password" : "Password"}
                </Label>
                <div className="password-field">
                  <Input
                    id="password"
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={setup || recovering ? 12 : undefined}
                    maxLength={128}
                    autoComplete={
                      setup || recovering ? "new-password" : "current-password"
                    }
                    placeholder={
                      setup || recovering
                        ? "At least 12 characters"
                        : "Enter your password"
                    }
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              {(setup || recovering) && (
                <div className="field">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Once more, to be sure"
                  />
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    {setup
                      ? "Create your space"
                      : recovering
                        ? "Reset password"
                        : "Sign in"}
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>
            {!setup && (
              <button
                className="text-button auth-secondary"
                onClick={() => {
                  setRecovering(!recovering);
                  setError("");
                  setPassword("");
                  setConfirm("");
                }}
              >
                {recovering ? (
                  <>
                    <ArrowLeft size={14} />
                    Back to sign in
                  </>
                ) : (
                  "Forgot your password?"
                )}
              </button>
            )}
          </>
        )}
        {step > 0 && error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <footer className="auth-footer">
        Your space. Your server. Your ideas.
      </footer>
    </main>
  );
}
