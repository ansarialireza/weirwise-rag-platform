"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Weirwise SW registered: ", registration.scope);
          })
          .catch((err) => {
            console.warn("Weirwise SW registration failed: ", err);
          });
      });
    }
  }, []);

  return null;
}
