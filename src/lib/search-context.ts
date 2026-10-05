import { plainText } from "./document-text";
import type { Document } from "./types";

export type TextRange = [number, number];
export function decodeMatches(value: string, start: string, end: string) {
  let text = "";
  const ranges: TextRange[] = [];
  let position = 0;
  while (position < value.length) {
    const open = value.indexOf(start, position);
    if (open < 0) {
      text += value.slice(position);
      break;
    }
    text += value.slice(position, open);
    const close = value.indexOf(end, open + start.length);
    if (close < 0) {
      text += value.slice(open);
      break;
    }
    const from = text.length;
    text += value.slice(open + start.length, close);
    ranges.push([from, text.length]);
    position = close + end.length;
  }
  return { text, ranges };
}
const normalize = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
export function findSearchBlock(
  blocks: Document["blocks"],
  terms: string[],
): string | undefined {
  const words = terms.filter(Boolean).map(normalize);
  let best: { id: string; score: number } | undefined;
  const visit = (items: Document["blocks"]) => {
    for (const block of items) {
      const own = normalize(plainText({ ...block, children: undefined }));
      const score = words.filter((word) => own.includes(word)).length;
      if (
        score &&
        typeof block.id === "string" &&
        (!best || score > best.score)
      )
        best = { id: block.id, score };
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);
  return best?.id;
}
