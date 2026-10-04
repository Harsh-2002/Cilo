export function uploadLimit() {
  const mib = Number(process.env.CILO_UPLOAD_LIMIT_MIB || 25);
  if (!Number.isInteger(mib) || mib < 1 || mib > 100)
    throw new Error("CILO_UPLOAD_LIMIT_MIB must be an integer from 1 to 100.");
  return mib * 1024 * 1024;
}
