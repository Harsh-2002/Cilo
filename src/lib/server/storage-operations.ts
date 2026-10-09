import { AsyncLocalStorage } from "node:async_hooks";
import { systemConfiguration } from "./system-configuration";

type Operations = {
  context: AsyncLocalStorage<string>;
  active: number;
  pending?: Promise<void>;
  release?: () => void;
  idle: Set<() => void>;
};
const root = globalThis as unknown as { nivraStorageOperations?: Operations };
const operations = (root.nivraStorageOperations ||= {
  context: new AsyncLocalStorage<string>(),
  active: 0,
  idle: new Set(),
});
export function operationProfile() {
  return operations.context.getStore() || systemConfiguration().media_profile;
}
export async function storageOperation<T>(work: () => Promise<T>): Promise<T> {
  while (operations.pending) await operations.pending;
  operations.active++;
  try {
    return await operations.context.run(
      systemConfiguration().media_profile,
      work,
    );
  } finally {
    if (--operations.active === 0) {
      for (const resolve of operations.idle) resolve();
      operations.idle.clear();
    }
  }
}
export async function activateStorage(work: () => void | Promise<void>) {
  if (operations.pending)
    throw new Error("A storage change is already being applied.");
  operations.pending = new Promise<void>((resolve) => {
    operations.release = resolve;
  });
  try {
    if (operations.active)
      await new Promise<void>((resolve) => operations.idle.add(resolve));
    await work();
  } finally {
    const release = operations.release;
    operations.pending = undefined;
    operations.release = undefined;
    release?.();
  }
}
