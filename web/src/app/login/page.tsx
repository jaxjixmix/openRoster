"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, Eye, EyeOff, ShieldCheck, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pb";
import { Button, ErrorNote, Input, Label } from "@/components/ui";

interface SetupStatus {
  setup_required: boolean;
  demo_available: boolean;
}

const DEMOS = [
  { label: "Administrator", email: "maya@harborhearth.co", role: "Full access" },
  { label: "Manager", email: "jordan@harborhearth.co", role: "Schedule + payroll" },
  { label: "Team member", email: "sam@harborhearth.co", role: "Shifts + clock" },
];

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false
    pb.send<SetupStatus>("/api/openroster/status", { method: "GET" })
      .then((status) => {
        if (cancelled) return
        if (status.setup_required) {
          router.replace("/setup")
          return
        }
        setDemoAvailable(status.demo_available)
        if (status.demo_available) {
          setEmail("maya@harborhearth.co")
          setPassword("OpenRoster123!")
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-night p-10 text-[#f4f1e8] lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.09]" style={{ backgroundImage: "linear-gradient(#f4f1e8 1px, transparent 1px), linear-gradient(90deg, #f4f1e8 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
        <div className="relative flex items-center gap-3">
          <span className="grid size-9 grid-cols-2 gap-1 rounded-lg bg-[#f4f1e8] p-1.5">
            <span className="rounded-[2px] bg-accent" />
            <span className="rounded-[2px] bg-[#14140f]/30" />
            <span className="rounded-[2px] bg-[#14140f]/30" />
            <span className="rounded-[2px] bg-[#14140f]" />
          </span>
          <span className="text-sm font-semibold tracking-tight">OpenRoster</span>
          <span className="ml-auto rounded-full border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#b9b3a3]">
            Self-hosted · Alpha
          </span>
        </div>

        <div className="relative mt-auto max-w-lg pb-10">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a7a18f]">
            Workforce management, without the bloat
          </p>
          <h1 className="text-[56px] font-semibold leading-[0.98] tracking-[-0.045em]">
            Every shift,
            <br />
            <span className="text-accent">covered.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#b9b3a3]">
            Scheduling, time clock, timesheets and payroll in one calm workspace.
            Built for restaurants, clinics and shops that run on real shifts.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {[
              { icon: CalendarDays, title: "Auto-fill schedules", text: "Availability, time off and hour caps, respected." },
              { icon: Clock3, title: "Clock in anywhere", text: "Punches roll into clean weekly timesheets." },
              { icon: Wallet, title: "Payroll-ready", text: "Gross pay, overtime, taxes and deductions." },
              { icon: ShieldCheck, title: "Your data, your server", text: "One binary. SQLite. No per-seat cloud." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <f.icon className="size-4 text-accent" />
                <p className="mt-3 text-xs font-semibold text-[#f4f1e8]">{f.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#a7a18f]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[10px] text-[#736e5f]">
          PocketBase + Next.js · AGPL-friendly original code · Demo data included
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="grid size-8 grid-cols-2 gap-1 rounded-lg bg-ink p-1.5">
                <span className="rounded-[2px] bg-accent" />
                <span className="rounded-[2px] bg-white/25" />
                <span className="rounded-[2px] bg-white/25" />
                <span className="rounded-[2px] bg-white" />
              </span>
              <span className="text-sm font-semibold">OpenRoster</span>
            </div>
          </div>

          <p className="eyebrow mb-3">Welcome back</p>
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">
            Sign in to your roster
          </h2>
          <p className="mt-2 text-sm text-muted">
            Use your work email. Your role decides what you can see.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button type="submit" className="w-full" size="lg" loading={busy}>
              Sign in <ArrowRight className="size-4" />
            </Button>
          </form>

          {demoAvailable && (
            <>
          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Demo accounts</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-2">
            {DEMOS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => {
                  setEmail(demo.email);
                  setPassword("OpenRoster123!");
                  setError("");
                }}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-line-strong hover:bg-raised"
              >
                <div>
                  <p className="text-xs font-semibold">{demo.label}</p>
                  <p className="text-[10px] text-muted">{demo.email}</p>
                </div>
                <span className="text-[10px] text-muted">{demo.role}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-muted">
            Password for all demo accounts: <span className="font-mono">OpenRoster123!</span>
          </p>
            </>
          )}
          <p className="mt-8 text-center text-[10px] leading-relaxed text-muted">
            Alpha software. Not tax-compliant. Do not use for real payroll.
          </p>
        </div>
      </div>
    </div>
  );
}
