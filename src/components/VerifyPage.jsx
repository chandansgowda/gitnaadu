import { useEffect, useMemo, useRef } from "react";
import { GitBranch } from "lucide-react";
import { CERT, CERT_W, drawCertificate, loadCertFonts } from "../lib/certificate";
import { certificateData, decodeCertificate } from "../lib/certificateLink";

// Public page behind the QR code on a certificate: `/?cert=<code>`. It reads
// everything from the link, so it never touches the visitor's saved playground.
const Shell = ({ children }) => (
    <div className="fixed inset-0 overflow-y-auto bg-surface-0 text-white" data-testid="verify-page">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 pt-5 pb-10 sm:pt-8 sm:pb-14">
            <a href="/" className="inline-flex items-center gap-2.5 mb-8">
                <span className="w-8 h-8 rounded-md bg-yellow text-black flex items-center justify-center">
                    <GitBranch className="w-4 h-4" strokeWidth={2.5} />
                </span>
                <span className="font-bold text-base tracking-tight">GitNaadu</span>
            </a>
            {children}
            <p className="mt-8 pt-5 border-t border-surface-3 text-sm text-zinc-400 leading-relaxed">
                GitNaadu is a free Git playground by {CERT.brand.name}.{" "}
                <a href="/" className="text-yellow underline underline-offset-2 hover:text-white">
                    Try it
                </a>{" "}
                or{" "}
                <a
                    href={CERT.courseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow underline underline-offset-2 hover:text-white"
                >
                    watch the course
                </a>
                .
            </p>
        </div>
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
                <div data-testid="verify-invalid">
                    <h1 className="text-2xl font-bold tracking-tight">This certificate link isn't valid</h1>
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
                <p className="text-sm text-zinc-400">Certificate of completion</p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight break-words" data-testid="verify-name">
                    {cert.name}
                </h1>
                <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                    Completed all hands-on challenges of the {CERT.course} course on GitNaadu. Issued on{" "}
                    <span data-testid="verify-date">{data.dateText}</span> by {CERT.brand.name}.
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
            </div>
        </Shell>
    );
};
