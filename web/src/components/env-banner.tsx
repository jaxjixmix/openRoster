"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pb";
import { Button } from "@/components/ui";

// Shown on the login screen when the backend never answers, so a wrong or
// missing NEXT_PUBLIC_PB_URL stops being a blank spinner.
export function PbHealthNote() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`${pb.baseUrl}/api/health`, { signal: controller.signal })
      .then((res) => {
        if (res && res.ok && !cancelled) setDown(false);
      })
      .catch(() => {
        if (!cancelled) setDown(true);
      });
    const timer = setInterval(() => {
      fetch(`${pb.baseUrl}/api/health`)
        .then((res) => {
          if (res && res.ok) {
            if (!cancelled) setDown(false);
          }
        })
        .catch(() => {});
    }, 15000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  if (!down) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
      <div className="min-w-0">
        <p className="font-medium">Cannot reach PocketBase at {pb.baseUrl}</p>
        <p className="mt-0.5 text-xs">
          Start it with <code>make dev-pb</code>, or point the app elsewhere with <code>NEXT_PUBLIC_PB_URL</code>, then reload.
        </p>
      </div>
      <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );
}
