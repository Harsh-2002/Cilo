export function environment(
  source?: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  if (source)
    return { NODE_ENV: process.env.NODE_ENV ?? "development", ...source };
  const {
    NODE_ENV,
    NEXT_PHASE,
    NEXT_RUNTIME,
    NIVRA_DATA_DIR,
    NIVRA_PUBLIC_URL,
    NIVRA_ENCRYPTION_KEY_FILE,
  } = process.env;
  return {
    NODE_ENV: NODE_ENV ?? "development",
    NEXT_PHASE,
    NEXT_RUNTIME,
    NIVRA_DATA_DIR,
    NIVRA_PUBLIC_URL,
    NIVRA_ENCRYPTION_KEY_FILE,
  };
}
