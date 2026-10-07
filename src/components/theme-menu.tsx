"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = theme || "system";
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  return (
    <div className="navigation-theme">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Color theme: ${current}`}
            title={`Color theme: ${current}`}
          >
            <Icon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={current}
            onValueChange={(value) => {
              if (!["light", "dark", "system"].includes(value)) return;
              setBusy(true);
              setError("");
              void api("settings", {
                method: "PATCH",
                body: JSON.stringify({ theme: value }),
              })
                .then(() => setTheme(value))
                .catch(() => setError("Theme could not be saved. Try again."))
                .finally(() => setBusy(false));
            }}
          >
            {[
              { value: "light", label: "Light", Icon: Sun },
              { value: "dark", label: "Dark", Icon: Moon },
              { value: "system", label: "System", Icon: Monitor },
            ].map(({ value, label, Icon }) => (
              <DropdownMenuRadioItem key={value} value={value} disabled={busy}>
                <Icon size={15} />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="navigation-theme-error">
          {error}
        </p>
      )}
    </div>
  );
}
