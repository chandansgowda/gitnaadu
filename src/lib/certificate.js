// Course certificate: drawn on a canvas and exported as PDF / PNG entirely in
// the browser. Ported from the standalone certificate template.
import qrcode from "qrcode-generator";

export const CERT = {
    course: "Git & GitHub",
    brand: {
        name: "Engineering in Kannada",
        // Engineering in Kannada logo, pressed into the gold seal.
        logo: {
            w: 70,
            h: 81,
            body: "M14.10,80.74C13.92,80.42 13.42,80.15 12.59,79.96C9.70,79.29 5.49,76.16 3.53,73.25C0.82,69.21 0.60,67.74 0.60,53.52C0.60,47.70 0.64,43.62 0.70,43.29C0.75,42.99 0.84,42.30 0.90,41.75C1.31,37.68 1.33,37.60 2.08,35.87C3.86,31.79 7.24,28.91 11.50,27.83C12.24,27.64 13.10,27.42 13.40,27.35C14.40,27.10 15.98,27.00 18.94,27.00C23.27,27.00 23.57,26.80 21.95,24.95C21.55,24.48 21.00,23.82 20.74,23.47C19.54,21.89 19.52,21.88 17.25,21.79C15.69,21.73 15.35,21.69 14.70,21.47C14.29,21.33 13.63,21.12 13.25,21.01C6.74,19.13 3.94,9.84 8.28,4.50C9.42,3.09 11.80,1.10 12.34,1.10C12.64,1.10 13.71,0.49 13.82,0.25C13.98,-0.11 19.94,-0.16 20.05,0.20C20.13,0.46 20.69,0.83 21.42,1.10C26.51,2.98 29.18,9.92 26.85,15.21C26.26,16.56 26.37,17.02 27.66,18.55C28.07,19.04 29.57,20.89 30.97,22.65C34.53,27.09 34.42,27.00 36.00,27.00C37.32,27.00 37.73,26.77 38.72,25.45C38.97,25.12 39.84,24.11 40.64,23.21C43.90,19.58 44.13,19.19 43.75,17.80C42.13,11.83 48.04,6.00 53.87,7.83C58.56,9.29 61.10,13.74 59.66,17.95C58.75,20.58 57.56,22.03 55.38,23.16C53.95,23.89 53.83,23.92 51.85,23.99C49.71,24.07 49.52,24.14 48.72,25.12C47.41,26.71 47.78,26.99 51.20,26.99C53.77,27.00 54.73,27.10 55.97,27.47C56.46,27.61 57.25,27.83 57.73,27.96C62.65,29.21 67.15,33.94 68.35,39.10C68.94,41.66 68.93,41.47 68.97,52.60C69.02,64.58 68.97,66.01 68.45,68.22C67.25,73.35 62.20,78.59 57.16,79.95C56.17,80.22 55.84,80.40 55.68,80.76C55.50,81.15 14.31,81.14 14.10,80.74ZM54.41,70.64C57.55,69.72 58.87,67.07 58.35,62.73C58.19,61.40 58.19,61.11 58.30,60.09C58.52,58.20 58.56,44.18 58.35,42.75C58.00,40.35 57.23,39.26 55.22,38.32C54.61,38.03 16.49,37.82 15.14,38.10C13.48,38.44 11.70,40.32 11.29,42.15C11.05,43.19 11.09,65.71 11.33,66.64C11.84,68.62 13.47,70.23 15.45,70.69C16.24,70.87 53.78,70.83 54.41,70.64Z",
            play: "M29.89,63.70C28.71,63.49 27.65,62.25 27.40,60.79C27.17,59.45 27.31,47.53 27.57,46.98C28.43,45.12 30.22,44.56 32.15,45.56C33.96,46.50 41.91,51.08 42.50,51.53C44.59,53.09 44.90,54.91 43.33,56.41C42.52,57.18 41.95,57.54 36.50,60.72C31.70,63.52 30.90,63.88 29.89,63.70Z",
        },
    },
    issuer: {
        name: "Chandan S Gowda", // cursive signature + printed name
        title: "Engineering in Kannada",
    },
    // Linked from the verification page and from shared posts.
    courseUrl: "https://www.youtube.com/@EngineeringinKannada",
    // Where the verification QR code sits along the bottom: "left" | "right".
    qrPosition: "center",
};

const FONTS_HREF =
    "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Allison&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+Kannada:wght@400;500&family=Noto+Serif+Kannada:wght@700&display=swap";

// A4 landscape, 96 dpi base units.
export const CERT_W = 1123;
export const CERT_H = 794;
const W = CERT_W;
const H = CERT_H;
const CX = W / 2;

const COLOR = {
    paper: "#fdfbf6",
    ink: "#1b1d24",
    muted: "#67636f",
    rule: "#cdbf98",
    gold: "#a8842c",
    goldDeep: "#5c4511",
    placeholder: "#c8c1b0",
    signInk: "#111111",
};
const FONT = {
    serif: 'Fraunces, Georgia, "Times New Roman", serif',
    sans: '"IBM Plex Sans", "Segoe UI", Roboto, Arial, sans-serif',
    knSerif: '"Noto Serif Kannada", "Noto Sans Kannada", Tunga, serif',
    sign: 'Allison, "Segoe Script", "Brush Script MT", cursive',
};
const KANNADA = /[ಀ-೿]/;

export const cleanName = (s) =>
    String(s || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48);

export const validName = (s) => s.length >= 2 && /\p{L}/u.test(s);

// ---- drawing helpers ----
const line = (ctx, x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
};

const ring = (ctx, cx, cy, r, color, lw) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
};

// Letter-spaced Latin text, centred. Returns its width. (Never use on Kannada.)
const spaced = (ctx, text, cx, y, sp) => {
    const chars = [...text];
    const ws = chars.map((c) => ctx.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    let x = cx - total / 2;
    chars.forEach((c, i) => {
        ctx.fillText(c, x, y);
        x += ws[i] + sp;
    });
    ctx.textAlign = prev;
    return total;
};

// Largest font size (from `start` down to `min`) at which `text` fits `maxW`.
const fit = (ctx, text, makeFont, maxW, start, min) => {
    let s = start;
    for (; s > min; s -= 1) {
        ctx.font = makeFont(s);
        if (ctx.measureText(text).width <= maxW) break;
    }
    ctx.font = makeFont(s);
    return s;
};

// Text along a circle. dir 1 = across the top, dir -1 = across the bottom.
const arcText = (ctx, text, cx, cy, r, centre, dir, sp = 0) => {
    const chars = [...text];
    const ws = chars.map((c) => ctx.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
    let a = centre - (dir * total) / 2 / r;
    ctx.textAlign = "center";
    chars.forEach((c, i) => {
        const mid = a + (dir * (ws[i] / 2)) / r;
        ctx.save();
        ctx.translate(cx + r * Math.cos(mid), cy + r * Math.sin(mid));
        ctx.rotate(mid + (dir * Math.PI) / 2);
        ctx.fillText(c, 0, 0);
        ctx.restore();
        a += (dir * (ws[i] + sp)) / r;
    });
};

let logoPaths = null;
const drawLogo = (ctx, x, y, h, color) => {
    const L = CERT.brand.logo;
    if (!logoPaths) logoPaths = { body: new Path2D(L.body), play: new Path2D(L.play) };
    const s = h / L.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.fill(logoPaths.body, "evenodd");
    ctx.fill(logoPaths.play);
    ctx.restore();
};

const drawSeal = (ctx, cx, cy) => {
    const R = 54;
    const teeth = 46;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
        const a = (i * Math.PI) / teeth;
        const r = i % 2 ? R - 3 : R;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, "#ead28a");
    g.addColorStop(0.5, "#c9a547");
    g.addColorStop(1, "#a07c27");
    ctx.fillStyle = g;
    ctx.fill();
    ring(ctx, cx, cy, R - 8, COLOR.goldDeep, 1);
    ring(ctx, cx, cy, R - 10.5, COLOR.goldDeep, 0.5);
    ring(ctx, cx, cy, 28, COLOR.goldDeep, 0.8);

    ctx.fillStyle = COLOR.goldDeep;
    ctx.font = `600 7.2px ${FONT.sans}`;
    arcText(ctx, "ENGINEERING IN KANNADA", cx, cy, 33.5, -Math.PI / 2, 1, 1.1);
    arcText(ctx, "•  GITNAADU  •", cx, cy, 39.2, Math.PI / 2, -1, 1.1);

    const lh = 30;
    const lw = (CERT.brand.logo.w * lh) / CERT.brand.logo.h;
    drawLogo(ctx, cx - lw / 2, cy - lh / 2 - 1, lh, COLOR.goldDeep);
};

const drawSignature = (ctx, cx, baseline) => {
    const text = CERT.issuer.name;
    ctx.save();
    ctx.translate(cx, baseline + 2);
    ctx.rotate(-0.045);
    fit(ctx, text, (s) => `400 ${s}px ${FONT.sign}`, 220, 56, 26);
    ctx.fillStyle = COLOR.signInk;
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 0);
    ctx.restore();
};

// Seal and QR code share the centre of the footer when the position is
// "center": seal on the left, QR on the right, centred as a pair.
const SEAL_Y = 636;
const SEAL_SIZE = 108;
const QR_SIZE = 92;
const PAIR_GAP = 26;
const PAIR_LEFT = CX - (SEAL_SIZE + PAIR_GAP + QR_SIZE) / 2;

// QR code for the verification link: beside the seal ("center") or in a
// bottom corner ("left" / "right"). Dark modules are drawn straight onto the
// paper, which doubles as the quiet zone.
const drawVerifyQr = (ctx, url, position) => {
    const size = QR_SIZE;
    const centered = position === "center";
    const x = centered ? PAIR_LEFT + SEAL_SIZE + PAIR_GAP : position === "right" ? W - 64 - size : 64;
    const y = centered ? SEAL_Y - size / 2 - 4 : H - 64 - size - 8;
    let qr;
    try {
        // Lowest error correction: fewer, larger modules scan best from a
        // clean print or screen.
        qr = qrcode(0, "L");
        qr.addData(url);
        qr.make();
    } catch {
        return; // too long to encode: leave the space empty
    }
    const n = qr.getModuleCount();
    const cell = size / n;
    ctx.fillStyle = COLOR.ink;
    for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
            if (qr.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.06, cell + 0.06);
    ctx.fillStyle = COLOR.muted;
    ctx.font = `600 8px ${FONT.sans}`;
    spaced(ctx, "SCAN TO VERIFY", x + size / 2, y + size + 14, 1.3);
};

// Draw the certificate onto `canvas`. data: { name, dateText, verifyUrl?, qrPosition? }.
export const drawCertificate = (canvas, data, scale = 1) => {
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineCap = "butt";

    // paper + double gold rule
    ctx.fillStyle = COLOR.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COLOR.gold;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(34, 34, W - 68, H - 68);

    // title
    ctx.fillStyle = COLOR.ink;
    ctx.font = `600 60px ${FONT.serif}`;
    spaced(ctx, "CERTIFICATE", CX, 168, 10);
    ctx.fillStyle = COLOR.gold;
    ctx.font = `600 15px ${FONT.sans}`;
    const sw = spaced(ctx, "OF COMPLETION", CX, 204, 6);
    ctx.strokeStyle = COLOR.gold;
    ctx.lineWidth = 0.9;
    line(ctx, CX - sw / 2 - 88, 198.5, CX - sw / 2 - 18, 198.5);
    line(ctx, CX + sw / 2 + 18, 198.5, CX + sw / 2 + 88, 198.5);

    // recipient
    ctx.fillStyle = COLOR.muted;
    ctx.font = `italic 400 21px ${FONT.serif}`;
    ctx.fillText("This is to certify that", CX, 268);
    const name = data.name || "Your Name";
    const isKn = KANNADA.test(name);
    fit(
        ctx,
        name,
        isKn ? (s) => `700 ${s}px ${FONT.knSerif}` : (s) => `italic 600 ${s}px ${FONT.serif}`,
        800,
        isKn ? 54 : 68,
        28,
    );
    ctx.fillStyle = data.name ? COLOR.ink : COLOR.placeholder;
    ctx.fillText(name, CX, 348);
    ctx.strokeStyle = COLOR.rule;
    ctx.lineWidth = 1;
    line(ctx, CX - 300, 376, CX + 300, 376);

    // course
    ctx.fillStyle = COLOR.muted;
    ctx.font = `400 18.5px ${FONT.sans}`;
    ctx.fillText("has successfully completed all hands-on challenges of the course", CX, 420);
    ctx.fillStyle = COLOR.ink;
    fit(ctx, CERT.course, (s) => `600 ${s}px ${FONT.serif}`, 800, 40, 20);
    ctx.fillText(CERT.course, CX, 474);

    // footer: date | seal (+ QR) | signature. With a QR code in a bottom
    // corner the two outer columns move in to leave it room.
    const qrPosition = data.verifyUrl ? data.qrPosition || CERT.qrPosition : null;
    const fy = 640;
    const inset = qrPosition && qrPosition !== "center" ? 330 : 258;
    const lx = inset;
    const rx = W - inset;
    ctx.fillStyle = COLOR.ink;
    ctx.font = `400 21px ${FONT.serif}`;
    ctx.fillText(data.dateText, lx, fy);
    drawSignature(ctx, rx, fy);
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 0.8;
    line(ctx, lx - 118, fy + 12, lx + 118, fy + 12);
    line(ctx, rx - 118, fy + 12, rx + 118, fy + 12);
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.ink;
    ctx.font = `600 13px ${FONT.sans}`;
    ctx.fillText("Date of Completion", lx, fy + 33);
    ctx.fillText(CERT.issuer.name, rx, fy + 33);
    ctx.fillStyle = COLOR.muted;
    fit(ctx, CERT.issuer.title, (s) => `400 ${s}px ${FONT.sans}`, 236, 11.5, 9);
    ctx.fillText(CERT.issuer.title, rx, fy + 51);

    drawSeal(ctx, qrPosition === "center" ? PAIR_LEFT + SEAL_SIZE / 2 : CX, SEAL_Y);
    if (qrPosition) drawVerifyQr(ctx, data.verifyUrl, qrPosition);
    return canvas;
};

// ---- fonts (a canvas only uses web fonts once they are loaded) ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fontSheet = null;
const loadFontSheet = () => {
    if (fontSheet) return fontSheet;
    fontSheet = new Promise((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = FONTS_HREF;
        link.onload = resolve;
        link.onerror = resolve; // offline: fall back to system fonts
        document.head.appendChild(link);
    });
    return fontSheet;
};

const FONT_SPECS = [
    [`600 50px ${FONT.serif}`, "CERTIFICATE Git & GitHub"],
    [`italic 600 68px ${FONT.serif}`, "Your Name"],
    [`italic 400 21px ${FONT.serif}`, "This is to certify that"],
    [`400 21px ${FONT.serif}`, "0123456789 November"],
    [`400 16px ${FONT.sans}`, "has successfully completed"],
    [`600 13px ${FONT.sans}`, "OF COMPLETION Date"],
    [`600 7.2px ${FONT.sans}`, "ENGINEERING IN KANNADA GITNAADU SCAN TO VERIFY"],
    [`400 56px ${FONT.sign}`, CERT.issuer.name],
];

let baseFonts = null;
export const loadCertFonts = async (name = "") => {
    if (typeof document === "undefined" || !document.fonts?.load) return;
    const load = async () => {
        await loadFontSheet();
        if (!baseFonts)
            baseFonts = Promise.all(FONT_SPECS.map(([f, t]) => document.fonts.load(f, t).catch(() => {})));
        const extra = name
            ? document.fonts
                  .load(KANNADA.test(name) ? `700 46px ${FONT.knSerif}` : `italic 600 68px ${FONT.serif}`, name)
                  .catch(() => {})
            : null;
        await Promise.all([baseFonts, extra]);
    };
    await Promise.race([load(), sleep(4000)]);
};

// ---- export: PNG + a minimal hand-written PDF (one A4 page, JPEG image) ----
const toBlob = (canvas, type, q) =>
    new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not render the image"))), type, q),
    );

const pdfString = (s) => {
    let hex = "FEFF";
    for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
    return `<${hex}>`;
};

const buildPdf = (jpeg, imgW, imgH, title) => {
    const PW = 841.89;
    const PH = 595.28;
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let pos = 0;
    const push = (d) => {
        const b = typeof d === "string" ? enc.encode(d) : d;
        parts.push(b);
        pos += b.length;
    };
    const obj = (n, body) => {
        offsets[n] = pos;
        push(`${n} 0 obj\n${body}\nendobj\n`);
    };

    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(
        3,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    );
    offsets[4] = pos;
    push(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push("\nendstream\nendobj\n");
    const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(6, `<< /Title ${pdfString(title)} /Author ${pdfString(CERT.brand.name)} /Creator (GitNaadu) >>`);

    const xref = pos;
    let table = "xref\n0 7\n0000000000 65535 f \n";
    for (let i = 1; i <= 6; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    push(table);
    push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: "application/pdf" });
};

const exportCanvas = async (data) => {
    await loadCertFonts(data.name);
    return drawCertificate(document.createElement("canvas"), data, 2.5);
};

export const makeCertPdf = async (data) => {
    const c = await exportCanvas(data);
    const jpeg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.93)).arrayBuffer());
    return buildPdf(jpeg, c.width, c.height, `${CERT.course} certificate, ${data.name}`);
};

export const makeCertPng = async (data) => toBlob(await exportCanvas(data), "image/png");

export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename, rel: "noopener" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const certFileName = (name, ext) => {
    const slug =
        name
            .normalize("NFC")
            .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
            .replace(/^-+|-+$/g, "") || "learner";
    return `GitNaadu-Certificate-${slug}.${ext}`;
};
