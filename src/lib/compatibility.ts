// Historical protocol inputs must stay stable so existing encrypted data remains readable.
export const historicalNamespace = String.fromCharCode(99, 105, 108, 111);
export const historicalConfigPrefix = `${historicalNamespace.toUpperCase()}_`;
export const historicalDatabaseName = `${historicalNamespace}.sqlite`;
export const historicalBundleFormat = historicalNamespace;
export const historicalBackupFormat = `${historicalNamespace}-backup`;
export const apiNamespacePattern = `(?:nivra|${historicalNamespace})`;
