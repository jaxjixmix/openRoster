"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportClientError } from "@/lib/monitoring";
import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
      <span className="rounded-xl bg-[#f7e5e2] p-3 text-danger"><AlertTriangle className="size-6" /></span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        The error was reported. Try again, or go back to the dashboard.
      </p>
      <div className="mt-5 flex gap-2">
        <Button onClick={reset}><RefreshCw className="size-4" /> Try again</Button>
        <Button variant="outline" onClick={() => router.push("/")}>Dashboard</Button>
      </div>
    </div>
  );
}
