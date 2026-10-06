import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { auth } from "../src/lib/server/auth";
import { sqlite, dataDir } from "../src/lib/server/db";
import { createNote } from "../src/lib/server/notes";
import { createTask } from "../src/lib/server/tasks";
import { createTextArtifact } from "../src/lib/server/artifacts";

async function main() {
  const [mode, output, requestedCount = "1000"] = process.argv.slice(2);
  const count = Number(requestedCount);
  assert.ok([1000, 5000].includes(count));
  assert.ok(output && path.isAbsolute(output));
  assert.ok(["seed", "extend", "session", "verify", "revoke"].includes(mode));
  assert.equal(process.env.NIVRA_SCALE_ALLOW, "dev-instance-fixtures");
  assert.equal(dataDir, path.resolve(process.env.NIVRA_DATA_DIR!));
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const database = sqlite();
  const owners = database.prepare("SELECT id FROM user").all() as {
    id: string;
  }[];
  assert.equal(owners.length, 1);
  const owner = owners[0].id;
  const manifestPath = path.join(output, "fixtures.json");
  if (mode === "session") {
    const ctx = await auth(new Request("https://dev.l3b.cc.cd")).$context;
    const session = await ctx.internalAdapter.createSession(
      owner,
      false,
      { expiresAt: new Date(Date.now() + 6 * 3600000) },
      true,
    );
    assert.ok(session);
    const value =
      session.token +
      "." +
      createHmac("sha256", ctx.secret).update(session.token).digest("base64");
    assert.ok(
      await auth(new Request("https://dev.l3b.cc.cd")).api.getSession({
        headers: new Headers({
          cookie: `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(value)}`,
        }),
      }),
      "Generated session validates through auth",
    );
    writeFileSync(
      path.join(output, "session.json"),
      JSON.stringify({
        cookies: [
          {
            name: ctx.authCookies.sessionToken.name,
            value,
            domain: "dev.l3b.cc.cd",
            path: "/",
            expires: Date.now() / 1000 + 6 * 3600,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ],
        origins: [],
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      path.join(output, "audit-session.json"),
      JSON.stringify({ id: session.id }),
      { mode: 0o600 },
    );
    console.log(
      "Short-lived audit session created; credentials retained privately.",
    );
    return;
  }
  if (mode === "revoke") {
    const { id } = JSON.parse(
      readFileSync(path.join(output, "audit-session.json"), "utf8"),
    );
    database
      .prepare("DELETE FROM session WHERE id=? AND user_id=?")
      .run(id, owner);
    console.log("Audit session revoked.");
    return;
  }
  if (mode === "verify") {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      string[]
    >;
    for (const [kind, ids] of Object.entries(manifest)) {
      const table = kind === "journals" ? "notes" : kind;
      assert.equal(ids.length, count);
      assert.equal(new Set(ids).size, count);
      for (let offset = 0; offset < ids.length; offset += 500) {
        const batch = ids.slice(offset, offset + 500);
        const found = database
          .prepare(
            `SELECT COUNT(*) AS count FROM ${table} WHERE id IN (${batch.map(() => "?").join(",")}) AND owner_id=? AND trashed_at IS NULL`,
          )
          .get(...batch, owner) as { count: number };
        assert.equal(found.count, batch.length);
      }
    }
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    const statuses: Record<string, number> = {};
    for (let offset = 0; offset < manifest.artifacts.length; offset += 500) {
      const batch = manifest.artifacts.slice(offset, offset + 500);
      const rows = database
        .prepare(
          `SELECT extraction,COUNT(*) AS count FROM artifacts WHERE kind!='text' AND id IN (${batch.map(() => "?").join(",")}) GROUP BY extraction`,
        )
        .all(...batch) as { extraction: string; count: number }[];
      for (const row of rows)
        statuses[row.extraction] = (statuses[row.extraction] || 0) + row.count;
    }
    console.log(JSON.stringify({ processedFileFixtures: statuses }));
    console.log(
      `Verified ${count} notes, tasks, bookmarks, artifacts and journals; encrypted database integrity OK.`,
    );
    return;
  }
  assert.equal(
    existsSync(manifestPath),
    mode === "extend",
    "Use seed for new fixtures or extend for an existing manifest",
  );
  const fixtureIds: Record<string, string[]> =
    mode === "extend"
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : { notes: [], tasks: [], bookmarks: [], artifacts: [], journals: [] };
  const previousCount = fixtureIds.notes.length;
  assert.ok(previousCount < count);
  for (const kind of ["notes", "tasks", "bookmarks", "journals"])
    assert.equal(fixtureIds[kind].length, previousCount);
  const persist = () => {
    writeFileSync(manifestPath + ".next", JSON.stringify(fixtureIds), {
      mode: 0o600,
      flush: true,
    });
    renameSync(manifestPath + ".next", manifestPath);
  };
  const fileGoal = count / 10;
  const textGoal = count - fileGoal;
  let textCount = 0;
  for (let offset = 0; offset < fixtureIds.artifacts.length; offset += 500) {
    const batch = fixtureIds.artifacts.slice(offset, offset + 500);
    textCount += (
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM artifacts WHERE kind='text' AND id IN (${batch.map(() => "?").join(",")})`,
        )
        .get(...batch) as { count: number }
    ).count;
  }
  const now = Date.now();
  const started = performance.now();
  for (let batch = previousCount / 100; batch < count / 100; batch++) {
    database
      .transaction(() => {
        for (let index = batch * 100; index < (batch + 1) * 100; index++) {
          const label = String(index + 1).padStart(4, "0");
          const content =
            `Scale test searchable token scaleprobe${label}. ` +
            "Synthetic content for pagination and retrieval. ".repeat(
              index % 100 === 0 ? 2000 : 12,
            );
          const document = {
            schemaVersion: 1 as const,
            blocks: [
              {
                type: "paragraph",
                content: [{ type: "text", text: content, styles: {} }],
              },
            ],
          };
          fixtureIds.notes.push(
            createNote(owner, `Scale test note ${label}`, document).id,
          );
          const date = new Date(Date.UTC(2080, 0, index + 1))
            .toISOString()
            .slice(0, 10);
          const journalId = randomUUID();
          database
            .prepare(
              "INSERT INTO notes(id,owner_id,title,document,text,daily_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            )
            .run(
              journalId,
              owner,
              `Scale test journal ${label}`,
              JSON.stringify(document),
              content,
              date,
              now + index,
              now + index,
            );
          fixtureIds.journals.push(journalId);
          const task = createTask(owner, `Scale test task ${label}`, {
            dueDate: index % 3 ? null : "2026-10-10",
            noteId: fixtureIds.notes.at(-1),
          });
          fixtureIds.tasks.push(task.id);
          if (index % 4 === 0)
            database
              .prepare("UPDATE tasks SET completed_at=? WHERE id=?")
              .run(now, task.id);
          const bookmarkId = randomUUID();
          database
            .prepare(
              "INSERT INTO bookmarks(id,owner_id,url,title,description,site_name,collection,metadata_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              bookmarkId,
              owner,
              `https://example.com/nivra-scale/${label}`,
              `Scale test link ${label}`,
              content.slice(0, 600),
              "Scale test",
              "Scale test",
              "ready",
              now + index,
              now + index,
            );
          fixtureIds.bookmarks.push(bookmarkId);
          if (textCount < textGoal) {
            textCount++;
            fixtureIds.artifacts.push(
              createTextArtifact(
                owner,
                `Scale test artifact ${label}\n${content}`,
              ).id,
            );
          }
        }
      })
      .immediate();
    persist();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const auditState = JSON.parse(
    readFileSync(path.join(output, "session.json"), "utf8"),
  );
  const signed = encodeURIComponent(auditState.cookies[0].value);
  const cookie = `better-auth.session_token=${signed}; __Secure-better-auth.session_token=${signed}`;
  const base = "https://dev.l3b.cc.cd";
  const fileStart = fixtureIds.artifacts.length - textCount;
  const acknowledgements: number[] = [];
  for (let index = fileStart; index < fileGoal; index++) {
    const isImage = index % 2 === 1;
    const name = `Scale test ${isImage ? "image" : "document"} ${String(index + textGoal + 1).padStart(4, "0")}.${isImage ? "png" : "pdf"}`;
    const form = new FormData();
    form.append(
      "file",
      new Blob(
        [
          readFileSync(
            isImage
              ? "tests/fixtures/ocr-sample.png"
              : "tests/fixtures/sample.pdf",
          ),
        ],
        { type: isImage ? "image/png" : "application/pdf" },
      ),
      name,
    );
    const uploadStart = performance.now();
    const result = await fetch(base + "/api/nivra/artifacts", {
      method: "POST",
      headers: { Cookie: cookie, Origin: base },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(result.status, 201, "Fixture file upload succeeds");
    const artifact = (await result.json()) as { id: string };
    acknowledgements.push(performance.now() - uploadStart);
    fixtureIds.artifacts.push(artifact.id);
    persist();
    if ((index + 1) % 50 === 0)
      console.log(
        `Stored ${index + 1}/${fileGoal} file artifacts through live HTTP uploads`,
      );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  persist();
  acknowledgements.sort((a, b) => a - b);
  writeFileSync(
    path.join(output, "seed-metrics.json"),
    JSON.stringify({
      count,
      addedPerSection: count - previousCount,
      seedMs: Math.round(performance.now() - started),
      fileUploads: acknowledgements.length,
      uploadP50Ms: Math.round(
        acknowledgements[Math.floor(acknowledgements.length * 0.5)] || 0,
      ),
      uploadP95Ms: Math.round(
        acknowledgements[Math.floor(acknowledgements.length * 0.95)] || 0,
      ),
    }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      counts: Object.fromEntries(
        Object.entries(fixtureIds).map(([kind, ids]) => [kind, ids.length]),
      ),
      seedMs: Math.round(performance.now() - started),
    }),
  );
}
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
