"use client";
import { useEffect } from "react";
export default function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA is optional; online app remains available. */
      });
  }, []);
  return null;
}
