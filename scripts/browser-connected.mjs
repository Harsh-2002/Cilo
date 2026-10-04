export default async function verifyConnected(page, phase) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Use the disposable review server.");
  page.setDefaultTimeout(10000);
  const api = async (path, method = "GET", data) => {
    const result = await page.request.fetch(`${base}/api/cilo/${path}`, {
      method,
      data,
    });
    if (!result.ok())
      throw new Error(`Fixture API failed: ${path} ${result.status()}`);
    return result.json();
  };
  if ((await api("status")).owner?.name !== "Review Owner")
    throw new Error("Use the disposable owner.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  const passed = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    passed.push(name);
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const open = async (note) => {
    await page.goto(`${base}/?note=${note.id}`);
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    await page.locator(".bn-editor").waitFor();
  };
  const stamp = `Connected${Date.now()}`;
  const doc = (text) => ({
    schemaVersion: 1,
    blocks: [
      { type: "paragraph", content: [{ type: "text", text, styles: {} }] },
    ],
  });
  if (phase === "search") {
    const note = await api("notes", "POST", {
      title: `${stamp} note`,
      document: doc("A connected idea"),
    });
    await api("tasks", "POST", { title: `${stamp} task` });
    const bookmark = await api("bookmarks", "POST", {
      url: `http://127.0.0.1/${stamp}`,
      collection: "",
    });
    await api(`bookmarks/${bookmark.id}`, "PATCH", {
      revision: bookmark.revision,
      title: `${stamp} bookmark`,
    });
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Search notes, tasks, bookmarks…").fill(stamp);
    for (const type of ["note", "task", "bookmark"])
      await page
        .getByRole("option")
        .filter({ hasText: `${stamp} ${type}` })
        .waitFor();
    check(true, "Global search finds notes, tasks and bookmarks");
    await page
      .getByPlaceholder("Search notes, tasks, bookmarks…")
      .fill(`type:task ${stamp}`);
    await page
      .getByRole("option")
      .filter({ hasText: `${stamp} task` })
      .waitFor();
    check(
      !(await page
        .getByRole("option")
        .filter({ hasText: `${stamp} note` })
        .count()),
      "Type filter excludes other content",
    );
    await page
      .getByRole("option")
      .filter({ hasText: `${stamp} task` })
      .click();
    await page
      .getByRole("checkbox", { name: `Complete ${stamp} task`, exact: true })
      .waitFor();
    check(true, "Selecting task search result opens matching task");
    await page.keyboard.press("Control+k");
    await page
      .getByPlaceholder("Search notes, tasks, bookmarks…")
      .fill(`type:note ${stamp}`);
    await page
      .getByRole("option")
      .filter({ hasText: `${stamp} note` })
      .waitFor();
    await page
      .getByRole("option")
      .filter({ hasText: `${stamp} note` })
      .press("Enter");
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === note.title,
      "Keyboard opens note from another section",
    );
    await page.keyboard.press("Control+k");
    await page.getByRole("option", { name: "Add a task", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      await page
        .getByRole("textbox", { name: "New task", exact: true })
        .evaluate((e) => e === document.activeElement),
      "Creation command focuses task input",
    );
    await page
      .getByRole("textbox", { name: "New task", exact: true })
      .fill("Unfinished capture");
    await page.keyboard.press("Control+k");
    await page.getByRole("option", { name: "New note", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    check(
      (await page
        .getByRole("textbox", { name: "New task", exact: true })
        .inputValue()) === "Unfinished capture",
      "Cancelled global navigation preserves task draft",
    );
    await page.getByRole("textbox", { name: "New task", exact: true }).fill("");
  }
  if (phase === "history") {
    const note = await api("notes", "POST", {
      title: `History ${stamp}`,
      document: doc("Earlier content is recoverable."),
    });
    await open(note);
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .fill(`Edited ${stamp}`);
    await page.locator(".save-status.saved").waitFor();
    await button("Note actions").click();
    await page
      .getByRole("menuitem", { name: "Version history", exact: true })
      .click();
    await page.locator(".history-preview .bn-editor").waitFor();
    check(
      (await page.locator(".history-preview").innerText()).includes(
        "Earlier content is recoverable.",
      ),
      "Version preview renders rich content",
    );
    check(
      (await page.locator(".history-preview").innerText()).includes(note.title),
      "History retains earlier title",
    );
    await button("Restore version").click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Restore version", exact: true })
      .click();
    await page.locator(".history-dialog").waitFor({ state: "hidden" });
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === note.title,
      "Confirmed history restore updates editor",
    );
    const versions = await api(`notes/${note.id}/history`);
    check(versions.length === 2, "Restoring preserves the replaced content");
    const replaced = await api(`notes/${note.id}/history/${versions[0].id}`);
    check(
      replaced.title === `Edited ${stamp}`,
      "Replaced version remains readable",
    );
  }
  if (phase === "connections") {
    const target = await api("notes", "POST", {
      title: `Target ${stamp}`,
      document: doc("Connected target"),
    });
    const source = await api("notes", "POST", { title: `Source ${stamp}` });
    await open(source);
    const editor = page.locator(".bn-editor");
    await editor.click();
    const suggestions = page.waitForResponse(
      (r) =>
        r.url().includes("/api/cilo/notes?") &&
        new URL(r.url()).searchParams.get("q") === target.title &&
        r.ok(),
    );
    await page.keyboard.type(`[[Target ${stamp}`);
    await suggestions;
    await page
      .locator('.bn-suggestion-menu-item[aria-selected="true"]')
      .filter({ hasText: target.title })
      .waitFor();
    await page.keyboard.press("Enter");
    await page.locator(`.bn-editor a[href="/?note=${target.id}"]`).waitFor();
    await page.locator(".save-status.saved").waitFor();
    check(true, "Double bracket autocomplete inserts a stable note link");
    await page.getByRole("button", { name: /^Related items/ }).click();
    await page
      .locator(".connection-row")
      .filter({ hasText: target.title })
      .waitFor();
    check(true, "Outgoing connection appears beneath the note");
    await page.locator(`.bn-editor a[href="/?note=${target.id}"]`).click();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === target.title,
      "Internal link opens target without leaving app",
    );
    await page.getByRole("button", { name: /^Related items/ }).click();
    await page
      .locator(".connection-row")
      .filter({ hasText: source.title })
      .waitFor();
    check(true, "Target displays source as backlink");
    await page.reload();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === target.title,
      "Stable note URL survives reload",
    );
  }
  if (phase === "schedule") {
    const target = await api("notes", "POST", { title: `Schedule ${stamp}` });
    await button("Tasks").click();
    await page
      .getByRole("textbox", { name: "New task", exact: true })
      .fill(`Scheduled ${stamp}`);
    await button("Add task").click();
    await button(`Actions for Scheduled ${stamp}`).click();
    await page
      .getByRole("menuitem", { name: "Edit task", exact: true })
      .click();
    await button("Due date").click();
    const calendar = page.locator(".date-picker-popover");
    await calendar.getByRole("button", { name: "Today", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Task recurrence", exact: true })
      .click();
    await page.getByRole("option", { name: "Every day", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Linked note", exact: true })
      .click();
    await page.getByPlaceholder("Find a note…").fill(target.title);
    await page.getByRole("option").filter({ hasText: target.title }).click();
    await button("Save").click();
    await page
      .getByRole("checkbox", {
        name: `Complete Scheduled ${stamp}`,
        exact: true,
      })
      .waitFor();
    const task = (await api("tasks")).find(
      (t) => t.title === `Scheduled ${stamp}`,
    );
    check(
      task.recurrence === "daily" &&
        task.noteId === target.id &&
        !!task.dueDate,
      "Date, recurrence and note link persist from UI",
    );
    await page
      .locator(".task-filters")
      .getByRole("button", { name: "Today", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: `Complete Scheduled ${stamp}`,
        exact: true,
      })
      .waitFor();
    check(true, "Today view includes scheduled task");
    await page
      .getByRole("checkbox", {
        name: `Complete Scheduled ${stamp}`,
        exact: true,
      })
      .click();
    await page
      .locator(".task-filters")
      .getByRole("button", { name: "Upcoming", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: `Complete Scheduled ${stamp}`,
        exact: true,
      })
      .waitFor();
    check(
      (await api("tasks")).filter((t) => t.parentTaskId === task.id).length ===
        1,
      "Completing daily occurrence creates one upcoming task",
    );
    await page
      .locator(".task-filters")
      .getByRole("button", { name: /^Completed / })
      .click();
    await page
      .getByRole("checkbox", { name: `Reopen Scheduled ${stamp}`, exact: true })
      .waitFor();
    check(true, "Completed occurrence remains in history");
    await button(`Open linked note ${target.title}`).first().click();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === target.title,
      "Task note link opens the editor",
    );
    await page.getByRole("button", { name: /^Related items/ }).click();
    await page
      .locator(".connection-row")
      .filter({ hasText: `Scheduled ${stamp}` })
      .first()
      .waitFor();
    check(true, "Note shows linked recurring occurrences");
  }
  if (phase === "templates") {
    const source = await api("notes", "POST", {
      title: `Reusable ${stamp}`,
      document: doc("A reusable starting point."),
    });
    await open(source);
    await button("Note actions").click();
    await page
      .getByRole("menuitem", { name: "Save as template", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Template name", exact: true })
      .fill(`Template ${stamp}`);
    await button("Save template").click();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === `Template ${stamp}`,
      "Save as template opens editable reusable copy",
    );
    const templates = await api("templates");
    const template = templates.find((t) => t.title === `Template ${stamp}`);
    check(
      !!template && templates.length >= 4,
      "Custom template joins the starter templates",
    );
    await button("Note actions").click();
    await page
      .getByRole("menuitem", { name: "Use for daily notes", exact: true })
      .click();
    await button("Today").click();
    await page
      .locator(".note-kind")
      .filter({ hasText: "Daily note" })
      .waitFor();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    await page
      .locator(".bn-editor")
      .filter({ hasText: "A reusable starting point." })
      .waitFor();
    const id = await page.locator(".note-pane").getAttribute("data-note-id");
    check(true, "Today opens the daily content");
    await button("All notes").click();
    await button("Today").click();
    await page
      .locator(".note-kind")
      .filter({ hasText: "Daily note" })
      .waitFor();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page.locator(".note-pane").getAttribute("data-note-id")) === id,
      "Opening Today again reuses the same daily note",
    );
    await button("Templates").click();
    await page
      .locator(".note-list-item")
      .filter({ hasText: `Template ${stamp}` })
      .click();
    await page.locator(".bn-editor").waitFor();
    await button("Note actions").click();
    await page
      .getByRole("menuitem", { name: "Create note from template", exact: true })
      .click();
    await page
      .locator(`.note-pane:not([data-note-id="${template.id}"])`)
      .waitFor();
    const created = await api(
      "notes/" +
        (await page.locator(".note-pane").getAttribute("data-note-id")),
    );
    check(
      created.kind === "note" && created.id !== template.id,
      "Template instantiation creates independent ordinary note",
    );
    await button("Templates").click();
    await page
      .locator(".note-list-item")
      .filter({ has: page.locator("strong", { hasText: "Meeting" }) })
      .first()
      .click();
    const checkbox = page.getByRole("checkbox", {
      name: "Complete checklist item",
      exact: true,
    });
    await checkbox.waitFor();
    const templateId = await page
      .locator(".note-pane")
      .getAttribute("data-note-id");
    const nextChecked = !(await checkbox.isChecked());
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/cilo/notes/" + templateId) &&
        r.request().method() === "PATCH" &&
        r.ok(),
    );
    await checkbox.click();
    await saved;
    const savedTemplate = await api("notes/" + templateId);
    check(
      savedTemplate.document.blocks.find((b) => b.type === "checkListItem")
        ?.props.checked === nextChecked,
      "Named starter checklist saves without an editor loop",
    );
    await page.reload();
    await checkbox.waitFor();
    check(
      (await checkbox.isChecked()) === nextChecked,
      "Checklist state survives reload",
    );
  }
  return { phase, passed };
}
