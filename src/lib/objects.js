// Safe lookups for objects used as string-keyed maps (file trees, index,
// branches, ...). A plain `obj[key]` / `key in obj` also sees inherited
// properties, so a file named `constructor` or `toString` would appear to
// exist. Keys named `__proto__` are rejected where names enter the system
// (see `isValidName` in filesystem.js and `refNameError` in gitEngine.js).
const hasOwn = Object.prototype.hasOwnProperty;

export const has = (obj, key) => obj != null && hasOwn.call(obj, key);

export const get = (obj, key) => (has(obj, key) ? obj[key] : undefined);
