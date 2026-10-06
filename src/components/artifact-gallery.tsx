"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

export function ArtifactGallery({
  children,
  loading,
}: {
  children: ReactNode;
  loading: boolean;
}) {
  const grid = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    let frame = 0;
    const arrange = () => {
      for (const card of Array.from(element.children) as HTMLElement[]) {
        const span = `span ${Math.ceil(card.getBoundingClientRect().height + 16)}`;
        if (card.style.gridRowEnd !== span) card.style.gridRowEnd = span;
      }
      element.dataset.measured = "true";
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(arrange);
    };
    const resize = new ResizeObserver(schedule);
    const observe = () => {
      resize.disconnect();
      resize.observe(element);
      for (const card of element.children) resize.observe(card);
      arrange();
    };
    const changes = new MutationObserver(observe);
    changes.observe(element, { childList: true });
    observe();
    return () => {
      changes.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <ul
      ref={grid}
      className="artifact-grid"
      aria-label="Saved artifacts"
      aria-busy={loading}
    >
      {children}
    </ul>
  );
}
