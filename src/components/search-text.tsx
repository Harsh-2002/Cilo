import type { TextRange } from "@/lib/search-context";
export function SearchText({
  text,
  ranges = [],
}: {
  text: string;
  ranges?: TextRange[];
}) {
  let position = 0;
  const parts = [];
  for (const [index, [start, end]] of ranges.entries()) {
    if (start < position || end <= start || end > text.length) continue;
    parts.push(
      text.slice(position, start),
      <mark key={index}>{text.slice(start, end)}</mark>,
    );
    position = end;
  }
  return (
    <>
      {parts}
      {text.slice(position)}
    </>
  );
}
