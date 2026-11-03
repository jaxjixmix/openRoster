import { PB_URL } from "./pb";

export function reportClientError(error: unknown, path?: string): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : "";
  fetch(`${PB_URL}/api/openroster/client-error`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, 1000),
      stack: String(stack || "").slice(0, 4000),
      path: path || window.location.pathname,
      userAgent: navigator.userAgent,
    }),
  }).catch(() => {});
}
