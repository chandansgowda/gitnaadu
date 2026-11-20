import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, BadgeCheck, GitBranch, ShieldAlert } from "lucide-react";
import { CERT, CERT_W, drawCertificate, loadCertFonts } from "../lib/certificate";
import { certificateData, decodeCertificate } from "../lib/certificateLink";

// Public page behind the QR code on a certificate: `/?cert=<code>`. It reads
// everything from the link, so it never touches the visitor's saved playground.
const Shell = ({ children }) => (
    <div className="fixed inset-0 overflow-y-auto bg-surface-0 text-white" data-testid="verify-page">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 pt-5 pb-10 sm:pt-8 sm:pb-14">
            <a href="/" className="inline-flex items-center gap-2.5 mb-6 sm:mb-8 group">
                <span className="w-9 h-9 rounded-lg bg-yellow text-black flex items-center justify-center">
                    <GitBranch className="w-5 h-5" strokeWidth={2.5} />
                </span>
                <span className="font-black text-lg tracking-tight group-hover:text-yellow transition-colors">
                    GitNaadu
                </span>
            </a>
            {children}
            <div className="mt-8 rounded-xl border border-surface-3 bg-surface-1 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <p className="flex-1 text-sm text-zinc-400 leading-relaxed">
                    GitNaadu is a free playground by {CERT.brand.name} for learning Git by doing, right in
                    the browser.
                </p>
                <a
                    href="/"
                    className="h-11 px-5 rounded-lg bg-yellow text-black text-sm font-bold flex items-center justify-center gap-2 hover:bg-yellow/90 transition-colors flex-shrink-0"
                >
                    Try GitNaadu
                    <ArrowRight className="w-4 h-4" />
                </a>
            </div>
        </div>
    </div>
);

const Row = ({ label, children }) => (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-surface-3 last:border-0">
        <dt className="text-xs uppercase tracking-wider text-zinc-500 flex-shrink-0">{label}</dt>
        <dd className="text-sm font-semibold text-right break-words min-w-0">{children}</dd>
    </div>
);

export const VerifyPage = ({ code }) => {
    const cert = useMemo(() => decodeCertificate(code), [code]);
    const data = useMemo(() => (cert ? certificateData(cert.name, cert.dateKey) : null), [cert]);
    const canvasRef = useRef(null);

    useEffect(() => {
        document.title = cert ? `${cert.name} | GitNaadu certificate` : "Certificate not found | GitNaadu";
    }, [cert]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data) return undefined;
        let alive = true;
        const draw = () => {
            if (!alive) return;
            const cssWidth = canvas.clientWidth || 900;
            const scale = Math.min(2.5, Math.max(1, (cssWidth * (window.devicePixelRatio || 1)) / CERT_W));
            drawCertificate(canvas, data, scale);
        };
        draw();
        loadCertFonts(data.name).then(draw);
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
    }, [data]);

    if (!cert)
        return (
            <Shell>
                <div
                    className="rounded-xl border border-rose-500/40 bg-rose-500/[0.06] p-5 sm:p-6"
                    data-testid="verify-invalid"
                >
                    <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-[0.16em]">
                        <ShieldAlert className="w-4 h-4" />
                        Not a valid certificate
                    </div>
                    <h1 className="mt-2 text-2xl font-black tracking-tight">We couldn't read this certificate link</h1>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                        The link is incomplete or was changed. Scan the QR code on the certificate again, or ask
                        its owner for the original link.
                    </p>
                </div>
            </Shell>
        );

    return (
        <Shell>
            <div data-testid="verify-valid">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-[0.16em]">
                    <BadgeCheck className="w-4 h-4" />
                    GitNaadu certificate
                </div>
                <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight break-words" data-testid="verify-name">
                    {cert.name}
                </h1>
                <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
                    completed all hands-on challenges of the {CERT.course} course on GitNaadu.
                </p>

                <div className="mt-5 rounded-lg overflow-hidden border border-surface-3 leading-[0]">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-auto block"
                        role="img"
                        aria-label={`Certificate of completion for ${cert.name}`}
                        data-testid="verify-canvas"
                    />
                </div>

                <dl className="mt-5 rounded-xl border border-surface-3 bg-surface-1 px-4 sm:px-5 py-1.5">
                    <Row label="Awarded to">{cert.name}</Row>
                    <Row label="Course">{CERT.course}</Row>
                    <Row label="Date of issue">
                        <span data-testid="verify-date">{data.dateText}</span>
                    </Row>
                    <Row label="Issued by">{CERT.brand.name}</Row>
                </dl>
            </div>
        </Shell>
    );
};
