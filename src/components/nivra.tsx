"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "@/lib/client";
import type { Owner, Settings } from "@/lib/types";
import { LaunchScreen } from "./launch-screen";
import { AuthScreen, Mark } from "./auth-screen";
import { Workspace } from "./workspace";
import { Button } from "./ui/button";
import type { WorkspaceView } from "@/lib/workspace-routes";
export function Nivra({
  initialView = "overview",
}: {
  initialView?: WorkspaceView;
}) {
  const [status, setStatus] = useState<{
    setup: boolean;
    owner: Owner | null;
    settings: Settings | null;
  } | null>(null);
  const [error, setError] = useState("");
  const { setTheme } = useTheme();
  const setThemeRef = useRef(setTheme);
  useEffect(() => {
    setThemeRef.current = setTheme;
  }, [setTheme]);
  const refresh = useCallback(async () => {
    await Promise.resolve();
    setError("");
    try {
      const result = await api<NonNullable<typeof status>>("status");
      setStatus(result);
      if (result.settings) setThemeRef.current(result.settings.theme);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  if (!status && !error) return <LaunchScreen />;
  if (!status)
    return (
      <main className="loading-page">
        <Mark />
        <p role="alert">{error}</p>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw size={16} />
          Try again
        </Button>
      </main>
    );
  return status.owner ? (
    <Workspace
      initialView={initialView}
      owner={status.owner}
      initialSettings={status.settings!}
      onSignOut={() => {
        setStatus(null);
        void refresh();
      }}
    />
  ) : (
    <AuthScreen setup={status.setup} onReady={refresh} />
  );
}
