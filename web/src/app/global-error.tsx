"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/monitoring";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f3f1ea", color: "#171712", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#6f6a5d" }}>OpenRoster</p>
          <h1 style={{ fontSize: 28, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>The app could not start</h1>
          <p style={{ fontSize: 14, color: "#6f6a5d", lineHeight: 1.6 }}>
            The error was reported. Reload the page or check the PocketBase and web container logs.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 24, height: 40, padding: "0 18px", borderRadius: 8, border: 0, background: "#171712", color: "#f4f1e8", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
