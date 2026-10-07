"use client";
import { plainContentToString } from "@blocknote/core";
import { createReactBlockSpec, SourceBlockWithPreview } from "@blocknote/react";
import { createReactDiagramBlockSpec } from "@blocknote/diagram-block";
import { ReaderDiagram } from "./reader-artifacts";

const original = createReactDiagramBlockSpec();
export const diagramBlockSpec = createReactBlockSpec(original.config, {
  meta: original.implementation.meta,
  parse: original.implementation.parse,
  parseContent: original.implementation.parseContent,
  runsBefore: ["codeBlock"],
  toExternalHTML: (props) => (
    <pre>
      <code
        className="language-mermaid"
        data-language="mermaid"
        ref={props.contentRef}
      />
    </pre>
  ),
  render: (props) => {
    const source = plainContentToString(props.block.content);
    return (
      <SourceBlockWithPreview
        {...props}
        source={source}
        preview={<ReaderDiagram source={source} />}
      />
    );
  },
})();
