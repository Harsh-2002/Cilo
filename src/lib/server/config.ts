import { systemConfiguration } from "./system-configuration";
export function validateUploadLimit(mib: number) {
  if (!Number.isInteger(mib) || mib < 1 || mib > 100)
    throw new Error("Upload limit must be an integer from 1 to 100 MiB.");
  return mib * 1024 * 1024;
}
export function uploadLimit() {
  return validateUploadLimit(systemConfiguration().upload_mib);
}
