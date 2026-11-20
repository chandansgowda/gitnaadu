// The link behind the QR code on a certificate. It carries the learner's name
// and the date of issue, base64-encoded in the `cert` query parameter, and
// opens a public page that shows the certificate (see VerifyPage).
//
// There is no server, so the link itself is the record. A short check code is
// included so that a link edited by hand (a different name or date) is
// rejected. It stops casual tampering only: the code is computed in the
// browser, so it is not a cryptographic proof of completion.

export const SITE_URL = "https://gitnaadu.engineeringinkannada.in";
export const CERT_PARAM = "cert";

const SALT = "gitnaadu-certificate-v1";

// Small, fast string hash (cyrb53) → 9 base36 characters.
const checkCode = (text) => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(9, "0").slice(-9);
};

const sign = (name, dateKey) => checkCode(`${SALT}|${name}|${dateKey}`);

const toBase64Url = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (code) => {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

// ---- dates: the certificate shows a calendar day, kept as "YYYYMMDD" ----
const pad = (n) => String(n).padStart(2, "0");

// ISO timestamp (or nothing, meaning today) → "YYYYMMDD" in local time.
export const toDateKey = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    const ok = !Number.isNaN(d.getTime());
    const use = ok ? d : new Date();
    return `${use.getFullYear()}${pad(use.getMonth() + 1)}${pad(use.getDate())}`;
};

// "YYYYMMDD" → Date at local midnight, or null when it isn't a real day.
export const parseDateKey = (key) => {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(key || "");
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
};

export const formatDateKey = (key) => {
    const date = parseDateKey(key);
    return date
        ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(date)
        : "";
};

// ---- the code in the link ----
export const encodeCertificate = (name, dateKey) => toBase64Url(`${name}|${dateKey}|${sign(name, dateKey)}`);

// → { name, dateKey } or null when the code is malformed or was altered.
export const decodeCertificate = (code) => {
    if (!code || code.length > 600 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
    let text;
    try {
        text = fromBase64Url(code);
    } catch {
        return null;
    }
    // The name may itself contain "|", so read the two fixed fields from the end.
    const parts = text.split("|");
    if (parts.length < 3) return null;
    const check = parts.pop();
    const dateKey = parts.pop();
    const name = parts.join("|");
    if (!name || name.length > 48 || name !== name.trim() || /[\u0000-\u001F\u007F]/.test(name)) return null;
    if (!parseDateKey(dateKey)) return null;
    if (check !== sign(name, dateKey)) return null;
    return { name, dateKey };
};

export const verifyUrl = (name, dateKey, base = SITE_URL) =>
    `${base.replace(/\/+$/, "")}/?${CERT_PARAM}=${encodeCertificate(name, dateKey)}`;

// Everything the certificate drawing needs for one learner.
export const certificateData = (name, dateKey) => ({
    name,
    dateText: formatDateKey(dateKey),
    verifyUrl: verifyUrl(name, dateKey),
});
