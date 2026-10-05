import type { ReactNode } from "react";
export function SystemPage({
  code,
  title,
  children,
  actions,
}: {
  code?: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className="system-page">
      <div>
        {code && (
          <span className="system-page-code" aria-hidden="true">
            {code}
          </span>
        )}
        <h1>{title}</h1>
        <p>{children}</p>
        {actions && <div className="system-page-actions">{actions}</div>}
      </div>
    </main>
  );
}
