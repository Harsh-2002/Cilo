// Instance files are runtime data, never build-tracing dependencies.
export const runtimeFs = process.getBuiltinModule("node:fs");
