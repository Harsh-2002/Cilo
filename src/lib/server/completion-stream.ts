import { sqlite } from "./db";
export function completionStream(
  request: Request,
  owner: string,
  sessionId: string,
) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let cursor = 0;
  let lastHeartbeat = Date.now();
  const stop = () => {
    closed = true;
    clearInterval(timer);
    request.signal.removeEventListener("abort", abort);
  };
  let abort = () => stop();
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const close = () => {
          if (closed) return;
          stop();
          controller.close();
        };
        abort = close;
        const send = (data: string) => {
          if (closed) return false;
          if ((controller.desiredSize ?? 0) <= 0) {
            close();
            return false;
          }
          controller.enqueue(encoder.encode(data));
          return true;
        };
        const latest = sqlite()
          .prepare(
            "SELECT coalesce(max(id),0) AS id FROM completion_events WHERE owner_id=?",
          )
          .get(owner) as { id: number };
        cursor = latest.id;
        send(`retry: 3000\nevent: resync\nid: ${cursor}\ndata: {}\n\n`);
        const tick = () => {
          if (
            !sqlite()
              .prepare(
                "SELECT 1 FROM session WHERE id=? AND user_id=? AND expires_at>?",
              )
              .get(sessionId, owner, Date.now())
          ) {
            send("event: revoked\ndata: {}\n\n");
            close();
            return;
          }
          const events = sqlite()
            .prepare(
              "SELECT id,kind,target_id AS target,status FROM completion_events WHERE owner_id=? AND id>? ORDER BY id LIMIT 101",
            )
            .all(owner, cursor) as {
            id: number;
            kind: string;
            target: string;
            status: string;
          }[];
          if (events.length > 100) {
            cursor = events[events.length - 1].id;
            send(`event: resync\nid: ${cursor}\ndata: {}\n\n`);
          } else
            for (const event of events) {
              cursor = event.id;
              if (
                !send(
                  `event: completion\nid: ${cursor}\ndata: ${JSON.stringify(event)}\n\n`,
                )
              )
                break;
            }
          if (Date.now() - lastHeartbeat >= 15_000) {
            send("event: heartbeat\ndata: {}\n\n");
            lastHeartbeat = Date.now();
          }
        };
        timer = setInterval(tick, 1000);
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) close();
      },
      cancel() {
        stop();
      },
    },
    { highWaterMark: 128 },
  );
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
