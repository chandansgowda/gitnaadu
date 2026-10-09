import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Whether pop-up notifications show: the per-command explainer cards and the
// progress / info toasts. Remembered per browser, like sound. Error toasts
// (e.g. "couldn't save your progress") always show.

const STORAGE_KEY = "gitnaadu:toasts";

export const useToasts = () => {
    const [enabled, setEnabled] = useState(() => {
        try {
            return window.localStorage.getItem(STORAGE_KEY) !== "0";
        } catch {
            return true;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        } catch {
            // ignore
        }
    }, [enabled]);

    const toggle = useCallback(() => {
        if (enabled) toast.dismiss();
        setEnabled(!enabled);
    }, [enabled]);

    const success = useCallback(
        (message, opts) => {
            if (enabled) toast.success(message, opts);
        },
        [enabled],
    );

    return { enabled, toggle, success };
};
