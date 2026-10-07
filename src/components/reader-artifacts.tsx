"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { MermaidConfig } from "mermaid";
import { useTheme } from "next-themes";
import type { highlightReaderCode } from "@/lib/reader-highlighter";
import { useCspNonce } from "@/lib/csp";
import { diagramSvg } from "@/lib/diagram-svg";
type ReaderTokens = Awaited<ReturnType<typeof highlightReaderCode>>;

export function ReaderCode({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [highlighted, setHighlighted] = useState<{
    code: string;
    language: string;
    tokens: ReaderTokens;
  } | null>(null);
  const tokens =
    highlighted?.code === code && highlighted.language === language
      ? highlighted.tokens
      : null;
  useEffect(() => {
    let active = true;
    if (code.length <= 50000 && language !== "text")
      void import("@/lib/reader-highlighter")
        .then((module) => module.highlightReaderCode(code, language))
        .then((value) => {
          if (active) setHighlighted({ code, language, tokens: value });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, language]);
  return (
    <pre className="reader-code">
      <code data-language={language}>
        {tokens
          ? tokens.map((line, index) => (
              <span key={index}>
                {line.map((token, key) => (
                  <span
                    key={key}
                    style={
                      {
                        "--reader-code-light": token.variants?.light?.color,
                        "--reader-code-dark": token.variants?.dark?.color,
                      } as CSSProperties
                    }
                  >
                    {token.content}
                  </span>
                ))}
                {index < tokens.length - 1 ? "\n" : ""}
              </span>
            ))
          : code}
      </code>
    </pre>
  );
}

export function ReaderDiagram({ source }: { source: string }) {
  const nonce = useCspNonce();
  const preview = useRef<HTMLElement>(null);
  const id = useId().replaceAll(":", "");
  const { resolvedTheme } = useTheme();
  const [rendered, setRendered] = useState<{
    source: string;
    theme: string | undefined;
    svg: string;
  } | null>(null);
  const svg =
    rendered?.source === source && rendered.theme === resolvedTheme
      ? rendered.svg
      : "";
  useLayoutEffect(() => {
    for (const node of preview.current?.querySelectorAll<SVGElement>(
      "[data-nivra-style]",
    ) || []) {
      node.style.cssText = node.getAttribute("data-nivra-style") || "";
      node.removeAttribute("data-nivra-style");
    }
  }, [svg]);
  useEffect(() => {
    let active = true;
    if (source.trim() && source.length <= 20000)
      void Promise.all([import("mermaid"), import("dompurify")])
        .then(async ([{ default: mermaid }, { default: purify }]) => {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: resolvedTheme === "dark" ? "dark" : "neutral",
            maxTextSize: 20000,
            maxEdges: 500,
            suppressErrorRendering: true,
            htmlLabels: false,
            flowchart: { htmlLabels: false },
            class: { htmlLabels: false },
            state: { htmlLabels: false },
            er: { htmlLabels: false },
          } as MermaidConfig);
          const rendered = await mermaid.render(`reader-${id}`, source);
          const safe = purify.sanitize(rendered.svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: ["foreignObject", "script", "a", "image", "use"],
            FORBID_ATTR: ["href", "xlink:href"],
          });
          if (active)
            setRendered({
              source,
              theme: resolvedTheme,
              svg: diagramSvg(safe, nonce),
            });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [source, id, resolvedTheme, nonce]);
  return svg ? (
    <figure
      ref={preview}
      className="reader-diagram"
      aria-label="Diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <pre className="reader-code">
      <code>{source}</code>
    </pre>
  );
}
