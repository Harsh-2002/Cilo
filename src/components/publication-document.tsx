import { ThemeProvider } from "next-themes";
import { PublishedReader } from "./published-reader";
import type { Document } from "@/lib/types";
import { CspNonce } from "@/lib/csp";

export type PublicationDocumentProps = {
  title: string;
  document: Document;
  publishedAt: number;
  nonce?: string;
};
export function PublicationDocument(props: PublicationDocumentProps) {
  return (
    <CspNonce.Provider value={props.nonce}>
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
    </CspNonce.Provider>
  );
}
