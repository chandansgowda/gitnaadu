import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Link2, Loader2, Share2 } from "lucide-react";
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
import { certificateData, linkedInAddUrl, shareLinks, sharePost, toDateKey } from "../lib/certificateLink";

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

const EMPTY = { name: "", email: "", phone: "", orgType: "college", orgName: "" };

const PRIVACY_URL = "/privacy.html";

const INPUT_CLS =
    "w-full h-11 rounded-lg bg-surface-0 border px-3.5 text-base sm:text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-yellow/70 ";

const PRIMARY_BTN =
    "h-11 px-4 rounded-lg bg-yellow text-black text-sm font-bold flex items-center justify-center gap-2 hover:bg-yellow/90 disabled:opacity-60 transition-colors";
const SECONDARY_BTN =
    "h-11 px-4 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-surface-3 disabled:opacity-50 transition-colors";

const Field = ({ id, label, error, children }) => (
    <div>
        <label htmlFor={id} className="block mb-1.5 text-xs font-semibold text-zinc-300">
            {label}
        </label>
        {children}
        {error && (
            <p className="mt-1 text-[11px] text-rose-400" role="alert">
                {error}
            </p>
        )}
    </div>
);

// Two steps: fill in the details, then confirm the name. Nothing is sent, and
// no certificate is issued, until the name is confirmed, because it can't be
// changed afterwards.
const DetailsForm = ({ onDone }) => {
    const [values, setValues] = useState(EMPTY);
    const [errors, setErrors] = useState({});
    const [agreed, setAgreed] = useState(false);
    const [confirming, setConfirming] = useState(null); // cleaned details awaiting confirmation
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const set = (key) => (e) => {
        const value = e.target.value;
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((er) => (er[key] ? { ...er, [key]: undefined } : er));
    };

    const review = (e) => {
        e.preventDefault();
        const details = cleanDetails(values);
        const found = validateDetails(details);
        if (!agreed) found.agree = "Please agree to the privacy policy to continue.";
        setErrors(found);
        const firstBad = Object.keys(found)[0];
        if (firstBad) {
            document.getElementById(`cert-${firstBad}`)?.focus();
            return;
        }
        setFailed(false);
        setConfirming(details);
    };

    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        try {
            await submitDetails(confirming);
            onDone(confirming.name);
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    if (confirming)
        return (
            <div data-testid="certificate-confirm">
                <p className="text-sm text-zinc-400">Your certificate will be issued to</p>
                <p
                    className="mt-2 rounded-lg border border-surface-3 bg-surface-0 px-4 py-4 text-xl font-bold text-white text-center break-words"
                    data-testid="certificate-confirm-name"
                >
                    {confirming.name}
                </p>
                <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                    Check the spelling. The name can't be changed once the certificate is generated.
                </p>
                {failed && (
                    <p className="mt-3 text-xs text-rose-400" role="alert">
                        Couldn't send your details. Check your internet connection and try again.
                    </p>
                )}
                <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
                    <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={busy}
                        className={SECONDARY_BTN + " sm:flex-1"}
                        data-testid="certificate-back-btn"
                    >
                        Go back and edit
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={busy}
                        className={PRIMARY_BTN + " sm:flex-1"}
                        data-testid="certificate-confirm-btn"
                    >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        {busy ? "Generating..." : "Confirm and generate"}
                    </button>
                </div>
            </div>
        );

    const border = (key) => (errors[key] ? "border-rose-500/70" : "border-surface-3");
    const orgWord = values.orgType === "company" ? "Company" : "College";

    return (
        <form onSubmit={review} noValidate className="space-y-4" data-testid="certificate-form">
            <Field id="cert-name" label="Name on the certificate" error={errors.name}>
                <input
                    id="cert-name"
                    className={INPUT_CLS + border("name")}
                    value={values.name}
                    onChange={set("name")}
                    maxLength={48}
                    autoComplete="name"
                    spellCheck={false}
                    placeholder="Your Name"
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

            <button type="submit" className={PRIMARY_BTN + " w-full"} data-testid="certificate-submit">
                Continue
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

const SHARE_TARGETS = [
    ["linkedin", "LinkedIn"],
    ["x", "X"],
    ["whatsapp", "WhatsApp"],
];

const CertificateView = ({ name, dateKey }) => {
    const data = useMemo(() => certificateData(name, dateKey), [name, dateKey]);
    const post = useMemo(
        () =>
            sharePost({
                url: data.verifyUrl,
                course: CERT.course,
                organization: CERT.brand.name,
                courseUrl: CERT.courseUrl,
            }),
        [data],
    );
    const links = useMemo(() => shareLinks(post), [post]);
    const canvasRef = useRef(null);
    const [busy, setBusy] = useState(null); // "pdf" | "png" | "share" | null
    const [message, setMessage] = useState(null); // { text, error }
    const [copied, setCopied] = useState(false);
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
            await job();
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
        run("pdf", async () => {
            downloadBlob(await makeCertPdf(data), certFileName(name, "pdf"));
            setMessage({ text: "Downloaded." });
        });
    const savePng = () =>
        run("png", async () => {
            downloadBlob(await makeCertPng(data), certFileName(name, "png"));
            setMessage({ text: "Downloaded." });
        });
    const share = () =>
        run("share", async () => {
            const file = new File([await makeCertPng(data)], certFileName(name, "png"), { type: "image/png" });
            await navigator.share({ files: [file], title: `${CERT.course} certificate`, text: post.long });
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

    const icon = (kind, Icon) =>
        busy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />;
    const shareBtn =
        "h-11 sm:h-9 px-3.5 rounded-lg bg-surface-2 border border-surface-3 text-sm sm:text-xs font-semibold text-white flex items-center justify-center gap-1.5 hover:bg-surface-3 disabled:opacity-50 transition-colors";

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

            <div className="mt-4 grid grid-cols-2 sm:flex gap-2">
                <button type="button" onClick={savePdf} disabled={!!busy} className={PRIMARY_BTN} data-testid="certificate-pdf">
                    {icon("pdf", Download)}
                    Download PDF
                </button>
                <button type="button" onClick={savePng} disabled={!!busy} className={SECONDARY_BTN} data-testid="certificate-png">
                    {icon("png", Download)}
                    Download PNG
                </button>
            </div>

            <div className="mt-5" data-testid="certificate-share">
                <p className="mb-2 text-xs font-semibold text-zinc-400">Share</p>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    {SHARE_TARGETS.map(([key, label]) => (
                        <a
                            key={key}
                            href={links[key]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={shareBtn}
                            data-testid={`share-${key}`}
                        >
                            {label}
                        </a>
                    ))}
                    {shareable && (
                        <button type="button" onClick={share} disabled={!!busy} className={shareBtn}>
                            {icon("share", Share2)}
                            More
                        </button>
                    )}
                    <button type="button" onClick={copyLink} className={shareBtn} data-testid="certificate-copy-link">
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />}
                        {copied ? "Copied" : "Copy link"}
                    </button>
                </div>
                <a
                    href={linkedInAddUrl({
                        url: data.verifyUrl,
                        dateKey,
                        course: `${CERT.course} (GitNaadu)`,
                        organization: CERT.brand.name,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-xs text-zinc-400 underline underline-offset-2 hover:text-white"
                    data-testid="share-linkedin-add"
                >
                    Add it to your LinkedIn profile
                </a>
            </div>

            <p
                className={"mt-2 min-h-[16px] text-xs break-all " + (message?.error ? "text-rose-400" : "text-zinc-500")}
                role="status"
            >
                {message?.text}
            </p>
        </div>
    );
};

// Shown once every challenge is complete: collects the learner's details,
// then issues the certificate. `completedAt` (ISO) is when the last challenge
// was finished; its day becomes the date of issue. Once issued, the name is
// fixed: there is no way back to the form.
export const CertificateDialog = ({ open, onOpenChange, completedAt }) => {
    const [saved, setSaved] = useState(readSaved);

    // Warm the fonts while the form is being filled in.
    useEffect(() => {
        if (open) loadCertFonts();
    }, [open]);

    const onDone = useCallback(
        (name) => {
            const next = { name, dateKey: toDateKey(completedAt), submittedAt: new Date().toISOString() };
            writeSaved(next);
            setSaved(next);
        },
        [completedAt],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={
                    "bg-surface-1 border-surface-3 text-white gap-0 p-5 sm:p-6 w-[calc(100vw-24px)] max-h-[92dvh] overflow-y-auto rounded-xl " +
                    (saved ? "max-w-3xl" : "max-w-md")
                }
                data-testid="certificate-dialog"
            >
                <DialogHeader className="mb-5 pr-6 text-left space-y-1.5">
                    <DialogTitle className="text-xl font-bold tracking-tight">
                        {saved ? "Your certificate" : "Get your certificate"}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-zinc-400 leading-relaxed">
                        {saved
                            ? `${CERT.course}, issued to ${saved.name}.`
                            : `You finished every challenge. Fill this in to get your ${CERT.course} certificate.`}
                    </DialogDescription>
                </DialogHeader>
                {saved ? (
                    <CertificateView name={saved.name} dateKey={saved.dateKey || toDateKey(completedAt)} />
                ) : (
                    <DetailsForm onDone={onDone} />
                )}
            </DialogContent>
        </Dialog>
    );
};
