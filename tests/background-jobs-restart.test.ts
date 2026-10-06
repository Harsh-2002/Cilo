import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

test("a fresh process recovers an expired encrypted extraction lease and updates FTS", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-jobs-restart-"));
  const child = (script: string) =>
    new Promise<string>((resolve, reject) => {
      const process = spawn(
        globalThis.process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        {
          env: { ...globalThis.process.env, NIVRA_DATA_DIR: directory },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "",
        error = "";
      const timer = setTimeout(() => {
        process.kill();
        reject(new Error("Restart fixture timed out."));
      }, 60000);
      process.stdout.on("data", (bytes) => {
        output += bytes;
      });
      process.stderr.on("data", (bytes) => {
        error += bytes;
      });
      process.once("error", reject);
      process.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output.trim());
        else reject(new Error(error || "Restart fixture failed."));
      });
    });
  try {
    assert.equal(
      await child(`
      import {sqlite} from './src/lib/server/db.ts';
      import {storage} from './src/lib/server/storage.ts';
      import {enqueueJob,claimJob} from './src/lib/server/jobs.ts';
      const db=sqlite(),now=Date.now();
      db.prepare("INSERT INTO user(id,name,email,email_verified,username,created_at,updated_at) VALUES('owner','Fixture','fixture@local.invalid',0,'fixture',?,?)").run(now,now);
      await storage.write('00000000-0000-0000-0000-000000000001',Buffer.from('Restart nebula searchable document'));
      db.transaction(() => {
        db.prepare("INSERT INTO artifacts(id,owner_id,kind,title,name,mime,storage_key,extraction,created_at,updated_at) VALUES('artifact','owner','file','Preserved title','restart.txt','text/plain','00000000-0000-0000-0000-000000000001','pending',?,?)").run(now,now);
        enqueueJob('owner','artifact','artifact');
      }).immediate();
      if(!claimJob())throw new Error('No claim');
      db.close();console.log('interrupted');
    `),
      "interrupted",
    );
    const recovered = JSON.parse(
      await child(`
      import {sqlite} from './src/lib/server/db.ts';
      import {claimJob,commitJob} from './src/lib/server/jobs.ts';
      import {processArtifact} from './src/lib/server/artifact-processing.ts';
      const db=sqlite();
      const job=claimJob(Date.now()+121000);
      if(!job)throw new Error('No recovered job');
      await processArtifact({job,commit:write=>commitJob(job,write)});
      const result=db.prepare("SELECT title,extraction,content FROM artifacts WHERE id='artifact'").get();
      const indexed=!!db.prepare("SELECT 1 FROM artifacts_fts WHERE artifacts_fts MATCH 'nebula'").get();
      const state=db.prepare("SELECT state,attempts FROM background_jobs").get();
      db.close();console.log(JSON.stringify({...result,...state,indexed}));
    `),
    );
    assert.deepEqual(recovered, {
      title: "Preserved title",
      extraction: "done",
      content: "Restart nebula searchable document",
      state: "done",
      attempts: 2,
      indexed: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
