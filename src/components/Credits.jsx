import { cn } from "../lib/utils";

const AUTHOR = { name: "Chandan Gowda", href: "https://www.linkedin.com/in/chandan-s-gowda" };
const CONTRIBUTOR = { name: "Mithun Gowda", href: "https://www.linkedin.com/in/mithungowdab" };

const CreditLink = ({ person, className }) => (
    <a
        href={person.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("underline underline-offset-2 hover:text-yellow focus-visible:text-yellow", className)}
    >
        {person.name}
        <span className="sr-only"> (LinkedIn, opens in a new tab)</span>
    </a>
);

// One credit line shared by the desktop status bar and the phone menu.
// `compact` keeps it on a single line (status bar); otherwise it wraps
// cleanly at "·" on narrow screens.
export const Credits = ({ compact = false, className, linkClassName }) => (
    <p
        className={cn(
            "flex items-center gap-x-1.5",
            compact ? "flex-nowrap whitespace-nowrap" : "flex-wrap gap-y-1",
            className,
        )}
        data-testid="credits"
    >
        <span className="whitespace-nowrap">
            Made with{" "}
            <span role="img" aria-label="love">
                ♥️
            </span>{" "}
            by
        </span>
        <CreditLink person={AUTHOR} className={linkClassName} />
        <span aria-hidden="true" className="opacity-60">
            ·
        </span>
        <span className="whitespace-nowrap">
            Contributor <CreditLink person={CONTRIBUTOR} className={linkClassName} />
        </span>
    </p>
);
