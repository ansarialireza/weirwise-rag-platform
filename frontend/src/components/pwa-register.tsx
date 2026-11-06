"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    let cancelled = false;
    let reloading = false;
    let registration: ServiceWorkerRegistration | null = null;
    let pendingWorker: ServiceWorker | null = null;
    const hadController = Boolean(navigator.serviceWorker.controller);

    // Swap the waiting worker only while the tab is hidden so a deploy never
    // reloads the page in the middle of someone typing.
    const activatePending = () => {
      if (!pendingWorker) return;
      pendingWorker.postMessage({ type: "SKIP_WAITING" });
      pendingWorker = null;
    };

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        activatePending();
      } else {
        registration?.update().catch(() => {});
      }
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;

        pendingWorker = registration.waiting;
        activatePending();

        registration.addEventListener("updatefound", () => {
          const worker = registration?.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") {
              pendingWorker = worker;
              if (document.visibilityState === "hidden") activatePending();
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        document.addEventListener("visibilitychange", onVisibilityChange);
      } catch {
        // Registration is best effort; the app works fine without it.
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
