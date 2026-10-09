"use client";
import { useState } from "react";
import { ArtifactIcon } from "./artifact-icon";
import type { Artifact } from "@/lib/types";
export function ArtifactPreview({ item }: { item: Artifact }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="artifact-thumb">
      {item.thumbnail && !failed ? (
        <img
          src={`/api/v1/artifacts/${item.id}/thumbnail?v=${item.updatedAt}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <ArtifactIcon
          item={item}
          size={36}
          strokeWidth={1.4}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
