import { hydrateRoot } from "react-dom/client";
import {
  PublicationDocument,
  type PublicationDocumentProps,
} from "../src/components/publication-document";

const root = document.getElementById("publication-root");
const data = document.getElementById("publication-data");
if (root && data?.textContent) {
  try {
    const theme = localStorage.getItem("nivra-theme");
    document.documentElement.classList.toggle(
      "dark",
      theme === "dark" ||
        ((!theme || theme === "system") &&
          matchMedia("(prefers-color-scheme: dark)").matches),
    );
  } catch {}
  const props = JSON.parse(data.textContent) as PublicationDocumentProps;
  props.nonce = document.querySelector<HTMLMetaElement>(
    'meta[name="nivra-nonce"]',
  )?.content;
  hydrateRoot(root, <PublicationDocument {...props} />);
}
