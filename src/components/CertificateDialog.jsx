import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, Check, Download, Link2, Loader2, Pencil, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
    CERT,
    CERT_W,
    certFileName,
    downloadBlob,
    drawCertificate,
    loadCertFonts,
    makeCertPdf,
    makeCertPng,
} from "../lib/certificate";
import { cleanDetails, submitDetails, validateDetails } from "../lib/certificateForm";
import { certificateData, toDateKey } from "../lib/certificateLink";

// Only the name and date of issue are remembered (to redraw the certificate
// next time); contact details are sent once and not kept in the browser.
const STORAGE_KEY = "gitnaadu:certificate";

const readSaved = () => {
    try {
        const v = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
        return v && typeof v.name === "string" ? v : null;
    } catch {
        return null;
    }
};

const writeSaved = (v) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
        // ignore
    }
};

const PRIVACY_URL = "/privacy.html";

const EMPTY = { name: "", email: "", phone: "", orgType: "college", orgName: "" };

const INPUT_CLS =
    "w-full h-11 rounded-lg bg-surface-0 border px-3.5 text-base sm:text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-yellow/70 ";

const Field = ({ id, label, hint, error, children }) => (
    <div>
        <label htmlFor={id} className="block mb-1.5 text-xs font-semibold text-zinc-300">
            {label}
            {hint && <span className="ml-1.5 font-normal text-zinc-500">{hint}</span>}
        </label>
        {children}
        {error && (
            <p className="mt-1 text-[11px] text-rose-400" role="alert">
                {error}
            </p>
        )}
    </div>
);

const DetailsForm = ({ initialName, onDone }) => {
    const [values, setValues] = useState({ ...EMPTY, name: initialName || "" });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [agreed, setAgreed] = useState(false);

    const set = (key) => (e) => {
        const value = e.target.value;
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((er) => (er[key] ? { ...er, [key]: undefined } : er));
    };

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        const details = cleanDetails(values);
        const found = validateDetails(details);
        if (!agreed) found.agree = "Please agree to the privacy policy to continue.";
        setErrors(found);
        const firstBad = Object.keys(found)[0];
        if (firstBad) {
            document.getElementById(`cert-${firstBad}`)?.focus();
            return;
        }
        setBusy(true);
        setFailed(false);
        try {
            await submitDetails(details);
            onDone(details.name);
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const border = (key) => (errors[key] ? "border-rose-500/70" : "border-surface-3");
    const orgWord = values.orgType === "company" ? "Company" : "College";

    return (
        <form onSubmit={submit} noValidate className="space-y-4" data-testid="certificate-form">
            <Field id="cert-name" label="Full name" hint="as it should appear on the certificate" error={errors.name}>
                <input
                    id="cert-name"
                    className={INPUT_CLS + border("name")}
                    value={values.name}
                    onChange={set("name")}
                    maxLength={48}
                    autoComplete="name"
                    spellCheck={false}
                    placeholder="English or ಕನ್ನಡ"
                />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="cert-email" label="Email" error={errors.email}>
                    <input
                        id="cert-email"
                        type="email"
                        inputMode="email"
                        className={INPUT_CLS + border("email")}
                        value={values.email}
                        onChange={set("email")}
                        maxLength={120}
                        autoComplete="email"
                        autoCapitalize="off"
                        spellCheck={false}
                        placeholder="you@example.com"
                    />
                </Field>
                <Field id="cert-phone" label="Phone number" error={errors.phone}>
                    <input
                        id="cert-phone"
                        type="tel"
                        inputMode="tel"
                        className={INPUT_CLS + border("phone")}
                        value={values.phone}
                        onChange={set("phone")}
                        maxLength={20}
                        autoComplete="tel"
                        placeholder="98765 43210"
                    />
                </Field>
            </div>

            <div>
                <span id="cert-orgType-label" className="block mb-1.5 text-xs font-semibold text-zinc-300">
                    I am from a
                </span>
                <div
                    role="radiogroup"
                    aria-labelledby="cert-orgType-label"
                    className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-0 border border-surface-3"
                >
                    {[
                        ["college", "College"],
                        ["company", "Company"],
                    ].map(([value, label]) => (
                        <label
                            key={value}
                            className={
                                "h-9 flex items-center justify-center rounded-md text-sm font-semibold cursor-pointer transition-colors focus-within:ring-1 focus-within:ring-yellow/70 " +
                                (values.orgType === value
                                    ? "bg-yellow text-black"
                                    : "text-zinc-400 hover:text-white hover:bg-surface-2")
                            }
                        >
                            <input
                                type="radio"
                                name="cert-orgType"
                                id={value === "college" ? "cert-orgType" : undefined}
                                value={value}
                                checked={values.orgType === value}
                                onChange={set("orgType")}
                                className="sr-only"
                            />
                            {label}
                        </label>
                    ))}
                </div>
            </div>

            <Field id="cert-orgName" label={`${orgWord} name`} error={errors.orgName}>
                <input
                    id="cert-orgName"
                    className={INPUT_CLS + border("orgName")}
                    value={values.orgName}
                    onChange={set("orgName")}
                    maxLength={120}
                    autoComplete="organization"
                    placeholder={values.orgType === "company" ? "Where you work" : "Where you study"}
                />
            </Field>

            <div>
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-400 cursor-pointer">
                    <input
                        id="cert-agree"
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => {
                            setAgreed(e.target.checked);
                            setErrors((er) => (er.agree ? { ...er, agree: undefined } : er));
                        }}
                        className="mt-0.5 w-4 h-4 flex-shrink-0 accent-yellow cursor-pointer"
                        data-testid="certificate-agree"
                    />
                    <span>
                        I agree to the{" "}
                        <a
                            href={PRIVACY_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow underline underline-offset-2 hover:text-white"
                        >
                            Privacy Policy
                        </a>{" "}
                        and to sharing these details with {CERT.brand.name}.
                    </span>
                </label>
                {errors.agree && (
                    <p className="mt-1 text-[11px] text-rose-400" role="alert">
                        {errors.agree}
                    </p>
                )}
            </div>

            {failed && (
                <p className="text-xs text-rose-400" role="alert">
                    Couldn't send your details. Check your internet connection and try again.
                </p>
            )}

            <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-lg bg-yellow text-black text-sm font-bold flex items-center justify-center gap-2 hover:bg-yellow/90 disabled:opacity-60 transition-colors"
                data-testid="certificate-submit"
            >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                {busy ? "Preparing your certificate..." : "Get my certificate"}
            </button>
        </form>
    );
};

const canShareFiles = () => {
    try {
        const probe = new File([new Blob(["x"], { type: "image/png" })], "probe.png", { type: "image/png" });
        return Boolean(navigator.canShare?.({ files: [probe] }));
    } catch {
        return false;
    }
};

const CertificateView = ({ name, dateKey, onEdit }) => {
    const data = useMemo(() => certificateData(name, dateKey), [name, dateKey]);
    const [copied, setCopied] = useState(false);
    const canvasRef = useRef(null);
    const [busy, setBusy] = useState(null); // "pdf" | "png" | "share" | null
    const [message, setMessage] = useState(null); // { text, error }
    const [shareable] = useState(canShareFiles);

    // Draw at once with whatever fonts are available, then again when the
    // web fonts have loaded; redraw when the preview is resized.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        let alive = true;
        const draw = () => {
            if (!alive) return;
            const cssWidth = canvas.clientWidth || 900;
            const scale = Math.min(2, Math.max(0.8, (cssWidth * (window.devicePixelRatio || 1)) / CERT_W));
            drawCertificate(canvas, data, scale);
        };
        draw();
        loadCertFonts(name).then(draw);
        let lastWidth = canvas.clientWidth;
        const ro =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(() => {
                      if (canvas.clientWidth === lastWidth) return;
                      lastWidth = canvas.clientWidth;
                      draw();
                  });
        ro?.observe(canvas);
        return () => {
            alive = false;
            ro?.disconnect();
        };
    }, [name, data]);

    const run = async (kind, job) => {
        if (busy) return;
        setBusy(kind);
        setMessage(null);
        try {
            await job(data);
        } catch (err) {
            if (err?.name !== "AbortError") {
                console.error(err);
                setMessage({ text: "Something went wrong while creating the file. Please try again.", error: true });
            }
        } finally {
            setBusy(null);
        }
    };

    const savePdf = () =>
        run("pdf", async (d) => {
            downloadBlob(await makeCertPdf(d), certFileName(name, "pdf"));
            setMessage({ text: "Downloaded." });
        });
    const savePng = () =>
        run("png", async (d) => {
            downloadBlob(await makeCertPng(d), certFileName(name, "png"));
            setMessage({ text: "Downloaded." });
        });
    const share = () =>
        run("share", async (d) => {
            const file = new File([await makeCertPng(d)], certFileName(name, "png"), { type: "image/png" });
            await navigator.share({ files: [file], title: `${CERT.course} certificate`, text: d.verifyUrl });
        });
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(data.verifyUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setMessage({ text: data.verifyUrl });
        }
    };

    const btn =
        "h-11 sm:h-10 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 flex-1 sm:flex-none ";
    const secondary = "bg-surface-2 border border-surface-3 text-white hover:bg-surface-3";
    const icon = (kind, Icon) =>
        busy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />;

    return (
        <div data-testid="certificate-view">
            <div className="rounded-lg overflow-hidden border border-surface-3 leading-[0]">
                <canvas
                    ref={canvasRef}
                    className="w-full h-auto block"
                    role="img"
                    aria-label={`Certificate of completion for ${name}`}
                    data-testid="certificate-canvas"
                />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={savePdf}
                    disabled={!!busy}
                    className={btn + "bg-yellow text-black hover:bg-yellow/90 basis-full sm:basis-auto"}
                    data-testid="certificate-pdf"
                >
                    {icon("pdf", Download)}
                    Download PDF
                </button>
                <button type="button" onClick={savePng} disabled={!!busy} className={btn + secondary} data-testid="certificate-png">
                    {icon("png", Download)}
                    PNG
                </button>
                {shareable && (
                    <button type="button" onClick={share} disabled={!!busy} className={btn + secondary}>
                        {icon("share", Share2)}
                        Share
                    </button>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <button
                    type="button"
                    onClick={copyLink}
                    className="h-9 text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
                    data-testid="certificate-copy-link"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                    {copied ? "Link copied" : "Copy verification link"}
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    disabled={!!busy}
                    className="h-9 text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Change name
                </button>
            </div>
            <p
                className={"mt-1 min-h-[16px] text-xs break-all " + (message?.error ? "text-rose-400" : "text-zinc-500")}
                role="status"
            >
                {message?.text}
            </p>
        </div>
    );
};

// Shown once every challenge is complete: collects the learner's details,
// then issues the certificate. `completedAt` (ISO) is when the last challenge
// was finished; its day becomes the date of issue.
export const CertificateDialog = ({ open, onOpenChange, completedAt }) => {
    const [saved, setSaved] = useState(readSaved);
    const [editing, setEditing] = useState(false);

    // Warm the fonts while the form is being filled in.
    useEffect(() => {
        if (open) loadCertFonts();
    }, [open]);

    const onDone = useCallback(
        (name) => {
            // Keep the first date of issue when only the name is corrected.
            const next = {
                name,
                dateKey: saved?.dateKey || toDateKey(completedAt),
                submittedAt: new Date().toISOString(),
            };
            writeSaved(next);
            setSaved(next);
            setEditing(false);
        },
        [saved, completedAt],
    );

    const showForm = !saved || editing;

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) setEditing(false);
                onOpenChange(v);
            }}
        >
            <DialogContent
                className={
                    "bg-surface-1 border-surface-3 text-white gap-0 p-5 sm:p-6 w-[calc(100vw-24px)] max-h-[92dvh] overflow-y-auto rounded-xl " +
                    (showForm ? "max-w-md" : "max-w-3xl")
                }
                data-testid="certificate-dialog"
            >
                <DialogHeader className="mb-5 pr-6 text-left space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5" />
                        Certificate
                    </p>
                    <DialogTitle className="text-xl font-black tracking-tight">
                        {showForm ? "You finished every challenge" : `Congratulations, ${saved.name}`}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-zinc-400 leading-relaxed">
                        {showForm
                            ? `Tell us who you are and your ${CERT.course} certificate is ready to download.`
                            : `Your ${CERT.course} certificate is ready. Anyone who scans its QR code can check it online.`}
                    </DialogDescription>
                </DialogHeader>
                {showForm ? (
                    <DetailsForm initialName={saved?.name} onDone={onDone} />
                ) : (
                    <CertificateView
                        name={saved.name}
                        dateKey={saved.dateKey || toDateKey(completedAt)}
                        onEdit={() => setEditing(true)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};
