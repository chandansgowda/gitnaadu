import { useCallback, useEffect, useState } from "react";

// "Install app" support. Chrome/Edge/Samsung fire `beforeinstallprompt`,
// which we keep so a menu item can open the install dialog later. iOS has
// no such event, so there we show Add-to-Home-Screen instructions instead.

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

// Listen from module load: the event can fire before React mounts.
if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        deferredPrompt = e;
        notify();
    });
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        notify();
    });
}

const isStandalone = () =>
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true);

const isIOS = () =>
    typeof navigator !== "undefined" &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
        // iPadOS reports itself as a Mac
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const useInstall = () => {
    const [, rerender] = useState(0);

    useEffect(() => {
        const fn = () => rerender((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);

    const standalone = isStandalone();
    const ios = !standalone && isIOS();

    // Resolves to "ios" when the caller should show manual instructions.
    const install = useCallback(async () => {
        if (!deferredPrompt) return "ios";
        const prompt = deferredPrompt;
        deferredPrompt = null;
        prompt.prompt();
        await prompt.userChoice.catch(() => null);
        notify();
        return "prompted";
    }, []);

    return { canInstall: !standalone && (!!deferredPrompt || ios), install };
};
