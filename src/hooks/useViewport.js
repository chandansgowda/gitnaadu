import { useEffect, useState } from "react";

// Matches Tailwind's `lg` breakpoint: below it the app switches to the
// single-view, bottom-tab "mobile app" layout.
const MOBILE_QUERY = "(max-width: 1023px)";

export const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window === "undefined"
            ? false
            : window.matchMedia(MOBILE_QUERY).matches,
    );
    useEffect(() => {
        const mq = window.matchMedia(MOBILE_QUERY);
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return isMobile;
};

// True on phones/tablets where there's no hardware keyboard or mouse.
export const isTouchDevice = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

// Tracks the *visual* viewport so the app shrinks above the on-screen
// keyboard (iOS Safari doesn't resize the layout viewport for it). Writes
// the height to `--app-height` and reports whether the keyboard is open.
export const useVisualViewport = () => {
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const root = document.documentElement;
        // Tallest height seen at the current width. Comparing against it
        // (rather than innerHeight) works whether the browser resizes the
        // layout viewport for the keyboard (Android) or not (iOS).
        let fullHeight = 0;
        let lastWidth = 0;
        const update = () => {
            // Ignore pinch-zoom: only the keyboard should resize the app.
            if (vv.scale > 1.01) return;
            root.style.setProperty("--app-height", `${vv.height}px`);
            // Keep the (overflow: hidden) page pinned when iOS scrolls it to
            // reveal a focused input.
            if (window.scrollY !== 0) window.scrollTo(0, 0);
            if (vv.width !== lastWidth) {
                lastWidth = vv.width;
                fullHeight = 0;
            }
            fullHeight = Math.max(fullHeight, vv.height);
            setKeyboardOpen(fullHeight - vv.height > 150);
        };
        update();
        vv.addEventListener("resize", update);
        vv.addEventListener("scroll", update);
        return () => {
            vv.removeEventListener("resize", update);
            vv.removeEventListener("scroll", update);
            root.style.removeProperty("--app-height");
        };
    }, []);
    return keyboardOpen;
};
