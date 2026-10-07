"use client";
import { brandPath, brandFramePath, brandTagline } from "@/lib/brand";
import { MfaSettings } from "./mfa-settings";
import { useState } from "react";
import {
  passkeyAuth,
  usePasskeySupported,
  passkeyCancelled,
} from "@/lib/passkey-client";
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
  KeyRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Checkbox } from "./ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, authRequest, download } from "@/lib/client";
import type { Settings } from "@/lib/types";

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="currentColor">
        <path d={brandFramePath} />
        <path d={brandPath} fill="var(--background)" />
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
                `Nivra recovery code\n\n${code}\n\nKeep this private. Using it resets your password and replaces the code.\n`,
              ],
              { type: "text/plain" },
            ),
            "nivra-recovery-code.txt",
          );
          setSaved(true);
        }}
      >
        <Download size={16} />
        Download recovery code
      </Button>
      <label className="check-row">
        <Checkbox
          checked={saved}
          onCheckedChange={(value) => setSaved(value === true)}
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
  methods,
  onReady,
}: {
  setup: boolean;
  methods: { password: boolean; passkey: boolean };
  onReady: () => void;
}) {
  const [setupMethod, setSetupMethod] = useState<"password" | "passkey">(
    "password",
  );
  const [mfaSetup, setMfaSetup] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaGuard, setMfaGuard] = useState(false);
  const [step, setStep] = useState(0);
  const [mfa, setMfa] = useState(false);
  const [backup, setBackup] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
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
  const passkeysSupported = usePasskeySupported();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const { theme, setTheme } = useTheme();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (
      ((setup && setupMethod === "password") || recovering) &&
      password !== confirm
    ) {
      setError("Your passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      if (setup) {
        let result: { recoveryCode: string };
        if (setupMethod === "passkey") {
          const intent = await api<{ context: string; recoveryCode: string }>(
            "setup-passkey",
            { method: "POST", body: JSON.stringify({ name, username }) },
          );
          try {
            const registered = await passkeyAuth.passkey.addPasskey({
              context: intent.context,
              createSession: true,
              name: "Primary passkey",
            });
            if (registered.error)
              throw new Error(
                passkeyCancelled(registered.error)
                  ? "Passkey creation was cancelled. Try again or choose password."
                  : registered.error.message ||
                      "Passkey creation failed. Try again.",
              );
            result = { recoveryCode: intent.recoveryCode };
          } finally {
            await api("setup-passkey/cancel", {
              method: "POST",
              body: JSON.stringify({ context: intent.context }),
            }).catch(() => {});
          }
        } else
          result = await api<{ recoveryCode: string }>("setup", {
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
        const result = await authRequest("sign-in/username", {
          username,
          password,
        });
        setPassword("");
        if (result.twoFactorRedirect) setMfa(true);
        else onReady();
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
        {mfa ? (
          <>
            <h1>One more step.</h1>
            <p className="auth-description">
              {backup
                ? "Enter one of your saved backup codes."
                : "Enter the six-digit code from your authenticator app."}
            </p>
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                void authRequest(
                  backup
                    ? "two-factor/verify-backup-code"
                    : "two-factor/verify-totp",
                  { code: mfaCode, trustDevice: false },
                )
                  .then(onReady)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <div className="field">
                <Label htmlFor="mfa-code">
                  {backup ? "Backup code" : "Authentication code"}
                </Label>
                <Input
                  id="mfa-code"
                  value={mfaCode}
                  autoComplete="one-time-code"
                  inputMode={backup ? "text" : "numeric"}
                  pattern={backup ? undefined : "[0-9]{6}"}
                  maxLength={backup ? 32 : 6}
                  required
                  autoFocus
                  onChange={(e) => setMfaCode(e.target.value.trim())}
                />
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" />}Verify
                and sign in
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setBackup(!backup);
                  setMfaCode("");
                  setError("");
                }}
              >
                {backup ? "Use authenticator code" : "Use a backup code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setMfa(false);
                  setMfaCode("");
                  setError("");
                }}
              >
                Back to sign in
              </Button>
            </form>
          </>
        ) : step === 1 ? (
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
              Choose your appearance. You can change this anytime in the
              sidebar.
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
            {setupMethod === "password" &&
              (mfaSetup ? (
                <MfaSettings
                  enabled={mfaEnrolled}
                  beforeAction={async () => true}
                  onChanged={setMfaEnrolled}
                  onGuardChange={(guard) => {
                    setMfaGuard(guard);
                    if (!guard && mfaEnrolled) setMfaSetup(false);
                  }}
                />
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={mfaEnrolled}
                  onClick={() => setMfaSetup(true)}
                >
                  {mfaEnrolled
                    ? "Authenticator enabled"
                    : "Add an authenticator (optional)"}
                </Button>
              ))}
            <p className="field-hint">
              You can add{" "}
              {setupMethod === "password"
                ? "passkeys"
                : "a password and an authenticator"}{" "}
              in Settings → Account.
            </p>
            <Button
              className="w-full"
              disabled={busy || mfaGuard}
              onClick={finish}
            >
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
                ? brandTagline
                : recovering
                  ? "Find your way back."
                  : "Welcome back."}
            </h1>
            <p className="auth-description">
              {setup
                ? "Your notes, ideas, and everything in between. Let’s make this space yours."
                : recovering
                  ? "Use your saved recovery code to set a new password. Registered passkeys stay valid; remove unwanted keys in Settings after signing in."
                  : "Pick up where your thoughts left off."}
            </p>
            {!setup && !recovering && methods.passkey && (
              <div className="auth-passkeys">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!passkeysSupported || busy}
                  onClick={() => {
                    setBusy(true);
                    setPasskeyBusy(true);
                    setError("");
                    void passkeyAuth.signIn
                      .passkey()
                      .then((result) => {
                        if (result.error) {
                          if (!passkeyCancelled(result.error))
                            setError(
                              result.error.message ||
                                "Passkey sign-in failed. Try again or use your password.",
                            );
                        } else onReady();
                      })
                      .catch(() =>
                        setError(
                          "Passkey sign-in failed. Try again or use your password.",
                        ),
                      )
                      .finally(() => {
                        setBusy(false);
                        setPasskeyBusy(false);
                      });
                  }}
                >
                  {passkeyBusy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <KeyRound size={16} />
                  )}{" "}
                  Sign in with a passkey
                </Button>
                <p className="field-hint">
                  {passkeysSupported
                    ? methods.password
                      ? "Or sign in with your password below."
                      : "Use your saved device, security key or password manager."
                    : "Passkeys need a supported browser and HTTPS or localhost."}
                </p>
              </div>
            )}
            {(setup || recovering || methods.password) && (
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
                    <Label htmlFor="username">Username or email</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      minLength={3}
                      maxLength={254}
                      autoCapitalize="none"
                      spellCheck={false}
                      autoComplete="username"
                      placeholder="Username or email address"
                    />
                    {setup && (
                      <p className="field-hint">
                        Use 3–30 letters, numbers, dots or underscores, or an
                        email address.
                      </p>
                    )}
                  </div>
                )}
                {setup && (
                  <div className="setup-auth-method">
                    <Label>How would you like to sign in?</Label>
                    <div role="group" aria-label="Sign-in method">
                      <Button
                        type="button"
                        variant={
                          setupMethod === "password" ? "default" : "outline"
                        }
                        aria-pressed={setupMethod === "password"}
                        onClick={() => {
                          setSetupMethod("password");
                          setError("");
                        }}
                      >
                        Password
                      </Button>
                      <Button
                        type="button"
                        variant={
                          setupMethod === "passkey" ? "default" : "outline"
                        }
                        aria-pressed={setupMethod === "passkey"}
                        disabled={!passkeysSupported}
                        onClick={() => {
                          setSetupMethod("passkey");
                          setPassword("");
                          setConfirm("");
                          setError("");
                        }}
                      >
                        <KeyRound size={16} />
                        Passkey
                      </Button>
                    </div>
                    <p className="field-hint">
                      {setupMethod === "passkey"
                        ? "Use a device, security key or password manager. No password is required."
                        : "Use a password, with an optional authenticator for extra protection."}
                    </p>
                  </div>
                )}
                {(!setup || setupMethod === "password") && (
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
                          setup || recovering
                            ? "new-password"
                            : "current-password"
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
                )}
                {((setup && setupMethod === "password") || recovering) && (
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
                        ? setupMethod === "passkey"
                          ? "Create your passkey"
                          : "Create your space"
                        : recovering
                          ? "Reset password"
                          : "Sign in"}
                      <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </form>
            )}
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
                  "Use recovery code"
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
    </main>
  );
}
