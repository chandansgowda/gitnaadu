import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// An earlier build registered an offline service worker. Remove it (and its
// caches) from devices that still have it.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches) {
    caches
      .keys()
      .then((keys) => keys.filter((k) => k.startsWith("gitnaadu-")).forEach((k) => caches.delete(k)))
      .catch(() => {});
  }
}
