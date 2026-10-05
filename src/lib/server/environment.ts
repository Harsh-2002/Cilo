export function environment(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    ...source,
  };
  for (const [name, value] of Object.entries(source)) {
    if (
      name.startsWith("CILO_") &&
      result[name.replace("CILO_", "NIVRA_")] === undefined
    )
      result[name.replace("CILO_", "NIVRA_")] = value;
  }
  return result;
}
