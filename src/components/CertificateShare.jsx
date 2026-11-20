import { Facebook, Linkedin, MessageCircle } from "lucide-react";
import { shareLinks } from "../lib/certificateLink";

const XIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const NETWORKS = [
    { key: "linkedin", label: "LinkedIn", Icon: Linkedin },
    { key: "x", label: "X", Icon: XIcon },
    { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
    { key: "facebook", label: "Facebook", Icon: Facebook },
];

// Share buttons for a certificate's verification link. `text` is the message
// that goes with the link; `children` adds extra actions after the buttons.
export const CertificateShare = ({ url, text, label = "Share your achievement", children }) => {
    const links = shareLinks(url, text);
    return (
        <div data-testid="certificate-share">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                {NETWORKS.map(({ key, label: name, Icon }) => (
                    <a
                        key={key}
                        href={links[key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 sm:h-9 px-3.5 rounded-lg bg-surface-2 border border-surface-3 text-sm sm:text-xs font-semibold text-white flex items-center justify-center gap-2 hover:bg-surface-3 hover:border-yellow/40 transition-colors"
                        data-testid={`share-${key}`}
                    >
                        <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        {name}
                    </a>
                ))}
                {children}
            </div>
        </div>
    );
};
