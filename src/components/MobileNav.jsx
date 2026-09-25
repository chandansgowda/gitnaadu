import { motion } from "framer-motion";
import {
    Terminal as TerminalIcon,
    GitBranch,
    FolderOpen,
    GitCompare,
    Cloud,
} from "lucide-react";

// Views shown in the phone layout's bottom tab bar. The editor has no tab of
// its own — it's reached from Files, so it lights up the Files tab.
export const MOBILE_TABS = [
    { value: "terminal", label: "Terminal", icon: TerminalIcon },
    { value: "git", label: "Graph", icon: GitBranch },
    { value: "files", label: "Files", icon: FolderOpen, also: ["editor"] },
    { value: "diff", label: "Diff", icon: GitCompare },
    { value: "remote", label: "Remote", icon: Cloud },
];

export const MobileNav = ({ tab, onChange, badges = {} }) => (
    <nav
        className="flex-shrink-0 border-t border-surface-3 bg-surface-1/95 backdrop-blur-md pb-safe"
        data-testid="mobile-nav"
    >
        <div className="grid grid-cols-5 h-14">
            {MOBILE_TABS.map((t) => {
                const active = tab === t.value || t.also?.includes(tab);
                return (
                    <button
                        key={t.value}
                        type="button"
                        onClick={() => onChange(t.value)}
                        className={
                            "relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-wide transition-colors " +
                            (active ? "text-yellow" : "text-zinc-500 active:text-zinc-300")
                        }
                        aria-current={active ? "page" : undefined}
                        data-testid={`mobile-tab-${t.value}`}
                    >
                        {active && (
                            <motion.span
                                layoutId="mobile-nav-pill"
                                className="absolute top-1.5 h-7 w-12 rounded-full bg-yellow/15"
                                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                            />
                        )}
                        <span className="relative">
                            <t.icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                            {badges[t.value] && !active && (
                                <span
                                    className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-yellow ring-2 ring-surface-1"
                                    data-testid={`mobile-tab-${t.value}-badge`}
                                />
                            )}
                        </span>
                        <span className="relative">{t.label}</span>
                    </button>
                );
            })}
        </div>
    </nav>
);
