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

const isStandalone = () =>
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

let insetProbe = null;
const safeAreaTop = () => {
    if (!insetProbe) {
        insetProbe = document.createElement("div");
        insetProbe.style.cssText =
            "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top)";
        document.body.appendChild(insetProbe);
    }
    return insetProbe.offsetHeight;
};

// Installed iOS apps (home-screen, black-translucent status bar) can report
// a viewport that is short by exactly the status-bar inset, leaving an empty
// band under the bottom nav. The app fills the whole screen there, so when
// the numbers match that pattern, return the screen height instead (0 when
// nothing needs fixing).
const standaloneHeight = () => {
    if (!isStandalone()) return 0;
    const reported = Math.max(
        window.visualViewport?.height || 0,
        window.innerHeight,
        document.documentElement.clientHeight,
    );
    const portrait = window.innerHeight >= window.innerWidth;
    const { width, height } = window.screen;
    const screenH = portrait ? Math.max(width, height) : Math.min(width, height);
    const inset = safeAreaTop();
    if (inset > 0 && Math.abs(screenH - (reported + inset)) <= 2) return screenH;
    return 0;
};

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
            if (vv.width !== lastWidth) {
                lastWidth = vv.width;
                fullHeight = 0;
            }
            fullHeight = Math.max(fullHeight, vv.height);
            // Only phones/tablets have an on-screen keyboard; on a desktop a
            // shrinking window must not hide the bottom nav.
            const kbOpen = isTouchDevice() && fullHeight - vv.height > 150;
            const fixed = kbOpen ? 0 : standaloneHeight();
            root.style.setProperty("--app-height", `${fixed || vv.height}px`);
            if (fixed) root.style.setProperty("--app-full-height", `${fixed}px`);
            else root.style.removeProperty("--app-full-height");
            // Keep the (overflow: hidden) page pinned when iOS scrolls it to
            // reveal a focused input.
            if (window.scrollY !== 0) window.scrollTo(0, 0);
            setKeyboardOpen(kbOpen);
        };
        update();
        vv.addEventListener("resize", update);
        vv.addEventListener("scroll", update);
        return () => {
            vv.removeEventListener("resize", update);
            vv.removeEventListener("scroll", update);
            root.style.removeProperty("--app-height");
            root.style.removeProperty("--app-full-height");
        };
    }, []);
    return keyboardOpen;
};
