import type { EventInput } from "./calendar";
export function scheduleItem(
  type: EventInput["links"][number]["type"],
  id: string,
  title: string,
) {
  window.dispatchEvent(
    new CustomEvent("nivra:schedule", { detail: { type, id, title } }),
  );
}
