export function environment(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  return { NODE_ENV: process.env.NODE_ENV ?? "development", ...source };
}
