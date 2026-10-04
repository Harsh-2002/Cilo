export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sqlite } = await import("./lib/server/db");
    sqlite();
  }
}
