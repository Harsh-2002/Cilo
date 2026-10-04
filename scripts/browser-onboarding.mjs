export default async function verifyOnboarding(browser, baseURL) {
  if (new URL(baseURL).port !== "3005")
    throw new Error("Use the empty disposable setup server on port 3005.");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const passed = [];
  const check = (value, name) => {
    if (!value) throw new Error(name);
    passed.push(name);
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const signOut = async () => {
    if (await button("Close").isVisible()) {
      await button("Close").click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await button("Open navigation").click();
    await page
      .getByRole("button", { name: /Setup Audit Owner Your personal space/ })
      .click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await button("Sign in").waitFor();
  };
  const login = async (password) => {
    await page.getByLabel("Username", { exact: true }).fill("setupreviewer");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await button("Sign in").click();
  };
  try {
    await page.goto(baseURL);
    const status = await context.request.get(`${baseURL}/api/cilo/status`);
    check(
      (await status.json()).setup,
      "Fresh instance offers single-owner onboarding",
    );
    const password = await page.evaluate(
      () =>
        "Audit-" +
        Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"),
    );
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Setup Audit Owner");
    await page.getByLabel("Username", { exact: true }).fill("setupreviewer");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await button("Create your space").click();
    await button("Make it yours").waitFor();
    check(
      await button("Make it yours").isDisabled(),
      "Recovery acknowledgement required",
    );
    await page.getByRole("checkbox").check();
    await button("Make it yours").click();
    await button("Light").click();
    await page.waitForTimeout(750);
    check(
      await button("Start writing").isVisible(),
      "Theme selection cannot prematurely exit onboarding",
    );
    await button("Start writing").click();
    await button("Open navigation").waitFor();
    check(true, "Setup completes through explicit action on mobile");
    await button("Open navigation").click();
    await button("Settings").click();
    await page.getByRole("tab", { name: "Account", exact: true }).click();
    await page
      .getByRole("button", { name: /Two-factor authentication/ })
      .click();
    await page.getByLabel("Current password", { exact: true }).fill(password);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/two-factor/enable") &&
        r.request().method() === "POST",
    );
    await button("Set up authenticator").click();
    const enrollment = await (await response).json();
    await page
      .getByRole("img", { name: "Authenticator setup QR code" })
      .waitFor();
    check(true, "Optional MFA enrollment renders QR setup");
    const code = await page.evaluate(async (uri) => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const bits = [...new URL(uri).searchParams.get("secret").toUpperCase()]
        .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
        .join("");
      const bytes = Uint8Array.from(
        { length: Math.floor(bits.length / 8) },
        (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2),
      );
      const counter = new ArrayBuffer(8);
      new DataView(counter).setBigUint64(
        0,
        BigInt(Math.floor(Date.now() / 30000)),
      );
      const key = await crypto.subtle.importKey(
        "raw",
        bytes,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"],
      );
      const hash = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, counter),
      );
      const offset = hash[hash.length - 1] & 15;
      return String(
        (new DataView(hash.buffer).getUint32(offset) & 0x7fffffff) % 1000000,
      ).padStart(6, "0");
    }, enrollment.totpURI);
    await page.getByLabel("Authentication code", { exact: true }).fill(code);
    await button("Verify and enable").click();
    await button("Done").waitFor();
    check(
      await button("Done").isDisabled(),
      "MFA backup-code acknowledgement required",
    );
    await page.getByRole("checkbox").check();
    await button("Done").click();
    await button("Disable two-factor authentication").waitFor();
    check(true, "MFA enrollment verified through UI");
    await signOut();
    await login(password);
    await button("Verify and sign in").waitFor();
    check(
      (await context.request.get(`${baseURL}/api/cilo/notes`)).status() === 401,
      "Password-only MFA challenge cannot access notes",
    );
    await button("Use a backup code").click();
    await page
      .getByLabel("Backup code", { exact: true })
      .fill(enrollment.backupCodes[0]);
    await button("Verify and sign in").click();
    await button("Open navigation").waitFor();
    check(true, "MFA backup code completes login through UI");
    await signOut();
    await login(password);
    await button("Use a backup code").click();
    await page
      .getByLabel("Backup code", { exact: true })
      .fill(enrollment.backupCodes[0]);
    await button("Verify and sign in").click();
    await page.locator(".form-error").waitFor();
    check(
      (await context.request.get(`${baseURL}/api/cilo/notes`)).status() === 401,
      "Reused MFA backup code is rejected without a session",
    );
    return { passed, count: passed.length };
  } finally {
    await context.close();
  }
}
