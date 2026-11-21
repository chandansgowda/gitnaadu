import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// `/?cert=<code>` (the QR code on a certificate) opens the public
// verification page instead of the playground.
// Loaded on demand so the playground's bundle stays the same size.
const certCode = new URLSearchParams(window.location.search).get("cert");
const VerifyPage = lazy(() =>
  import("@/components/VerifyPage").then((m) => ({ default: m.VerifyPage })),
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {certCode !== null ? (
      <Suspense fallback={null}>
        <VerifyPage code={certCode} />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

// Offline support for the installed app. Dev builds skip it so the service
// worker never serves stale bundles during development.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
