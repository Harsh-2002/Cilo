import { Loader2 } from "lucide-react";
export default function Loading() {
  return (
    <main className="system-page" role="status">
      <Loader2 size={20} className="animate-spin text-muted-foreground" />
      <span className="sr-only">Opening page</span>
    </main>
  );
}
