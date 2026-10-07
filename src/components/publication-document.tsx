import { ThemeProvider } from "next-themes";
import { PublishedReader } from "./published-reader";
import type { Document } from "@/lib/types";

export type PublicationDocumentProps = {
  title: string;
  document: Document;
  publishedAt: number;
};
export function PublicationDocument(props: PublicationDocumentProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="nivra-theme"
      scriptProps={{ type: "text/plain" }}
    >
      <div className="bn-scroll-container">
        <PublishedReader {...props} />
      </div>
    </ThemeProvider>
  );
}
