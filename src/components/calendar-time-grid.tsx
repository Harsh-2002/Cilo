"use client";
import { useCspNonce } from "@/lib/csp";
import type { CalendarItem } from "@/lib/calendar";
import { Button } from "./ui/button";
export function CalendarTimeGrid({
  days,
  items,
  onOpen,
}: {
  days: string[];
  items: CalendarItem[];
  onOpen: (item: CalendarItem) => void;
}) {
  const nonce = useCspNonce();
  const minimumHeight = 44;
  const minimumDuration = (minimumHeight / 48) * 60 * 60_000;
  const positions: string[] = [];
  let index = 0;
  const date = (day: string) => new Date(day + "T00:00").getTime();
  return (
    <div className={`schedule-time-grid schedule-time-${days.length}`}>
      <div className="schedule-time-labels">
        <span>All day</span>
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
        ))}
      </div>
      {days.map((day) => {
        const start = date(day);
        const next = new Date(day + "T12:00");
        next.setDate(next.getDate() + 1);
        const stop = new Date(
          next.getFullYear(),
          next.getMonth(),
          next.getDate(),
        ).getTime();
        const timed = items
          .filter(
            (item) =>
              item.startAt !== undefined &&
              item.endAt !== undefined &&
              item.startAt < stop &&
              item.endAt > start,
          )
          .sort((a, b) => a.startAt! - b.startAt!);
        const lanes: number[] = [];
        const placed = timed.map((item) => {
          const visibleStart = Math.max(start, item.startAt!);
          let lane = lanes.findIndex((value) => value <= visibleStart);
          if (lane < 0) lane = lanes.length;
          // Lane occupancy includes the minimum rendered height of short events.
          lanes[lane] = Math.max(
            Math.min(stop, item.endAt!),
            visibleStart + minimumDuration,
          );
          return { item, lane };
        });
        return (
          <section key={day} className="schedule-time-day">
            <h3>
              {new Date(day + "T12:00").toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
              })}
            </h3>
            <div className="schedule-time-all-day">
              {items
                .filter(
                  (item) =>
                    !item.startAt &&
                    item.date <= day &&
                    (item.endDate ? item.endDate > day : item.date === day),
                )
                .map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    onClick={() => onOpen(item)}
                  >
                    {item.title}
                  </Button>
                ))}
            </div>
            <div className="schedule-time-hours">
              {Array.from({ length: 24 }, (_, hour) => (
                <div className="schedule-time-hour" key={hour} />
              ))}
              {placed.map(({ item, lane }) => {
                const id = index++,
                  a = new Date(Math.max(start, item.startAt!)),
                  b = new Date(Math.min(stop, item.endAt!)),
                  top = ((a.getHours() * 60 + a.getMinutes()) / 1440) * 100,
                  bottom =
                    item.endAt! >= stop
                      ? 100
                      : ((b.getHours() * 60 + b.getMinutes()) / 1440) * 100;
                positions.push(
                  `.schedule-time-entry-${id}{top:${top}%;height:max(${minimumHeight}px,${Math.max(0, bottom - top)}%);left:calc(${(lane / lanes.length) * 100}% + 2px);width:calc(${100 / lanes.length}% - 4px)}`,
                );
                return (
                  <Button
                    key={item.id}
                    variant="outline"
                    className={`schedule-time-entry schedule-time-entry-${id}`}
                    title={item.title}
                    aria-label={`${item.title}, ${new Date(item.startAt!).toLocaleString()} to ${new Date(item.endAt!).toLocaleString()}`}
                    onClick={() => onOpen(item)}
                  >
                    <span>
                      {new Date(item.startAt!).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <strong>{item.title}</strong>
                  </Button>
                );
              })}
            </div>
          </section>
        );
      })}
      <style nonce={nonce}>{positions.join("\n")}</style>
    </div>
  );
}
