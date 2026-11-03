"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, ShieldAlert } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { Button, ErrorNote, Input, Label, Select } from "@/components/ui";

interface SetupStatus {
  setup_required: boolean;
  demo_available: boolean;
}

export default function SetupPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_name: "",
    timezone: "America/Los_Angeles",
    currency: "USD",
    week_start: "1",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    location_name: "",
    location_address: "",
  });

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    pb.send<SetupStatus>("/api/openroster/status", { method: "GET" })
      .then((status) => {
        if (cancelled) return;
        if (!status.setup_required) router.replace("/login");
        else setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await pb.send("/api/openroster/setup", { method: "POST", body: form });
      try {
        await login(form.admin_email, form.admin_password);
        router.replace("/");
      } catch {
        router.replace("/login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up the workspace.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          Checking workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
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
            Alpha
          </span>
        </div>

        <div className="relative mt-auto max-w-lg pb-10">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a7a18f]">
            First run
          </p>
          <h1 className="text-[48px] font-semibold leading-[0.98] tracking-[-0.045em]">
            Put the roster
            <br />
            <span className="text-accent">on the table.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#b9b3a3]">
            Create the company and the first administrator. You can add departments,
            positions, pay rules and the rest of the team once you are in.
          </p>
          <div className="mt-10 space-y-3">
            {[
              "One company per install — no tenant juggling.",
              "The first account is the administrator.",
              "Demo data is opt-in. A real workspace starts clean.",
            ].map((line) => (
              <div key={line} className="flex items-start gap-2 text-xs text-[#b9b3a3]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#9fd3b4]" />
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[560px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid size-8 grid-cols-2 gap-1 rounded-lg bg-ink p-1.5">
              <span className="rounded-[2px] bg-accent" />
              <span className="rounded-[2px] bg-white/25" />
              <span className="rounded-[2px] bg-white/25" />
              <span className="rounded-[2px] bg-white" />
            </span>
            <span className="text-sm font-semibold">OpenRoster</span>
          </div>

          <div className="mb-6 flex items-start gap-2 rounded-xl border border-[#e6d4ac] bg-[#fbf2dd] px-3.5 py-3 text-[11px] leading-relaxed text-[#82621c]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Alpha software.</strong> Do not use this for real payroll yet.
              Payroll here computes a configurable preview, not tax withholding or filings.
            </span>
          </div>

          <p className="eyebrow mb-3">Workspace setup</p>
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">
            Create your company
          </h2>
          <p className="mt-2 text-sm text-muted">
            This page is only available before the first account exists.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4 text-muted" /> Company
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Company name</Label>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Harbor & Hearth" required />
              </div>
              <div>
                <Label>First location</Label>
                <Input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} placeholder="Ferry Building" required />
              </div>
            </div>
            <div>
              <Label>Location address</Label>
              <Input value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} placeholder="1 Ferry Building, San Francisco, CA" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Timezone</Label>
                <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Singapore", "Australia/Sydney"].map((tz) => (
                    <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
              </div>
              <div>
                <Label>Week starts</Label>
                <Select value={form.week_start} onChange={(e) => setForm({ ...form, week_start: e.target.value })}>
                  <option value="1">Monday</option>
                  <option value="0">Sunday</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 text-sm font-semibold">
              <Check className="size-4 text-muted" /> First administrator
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Full name</Label>
                <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} placeholder="Maya Chen" required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="maya@company.com" required />
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="At least 10 characters" minLength={10} required />
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Create workspace <ArrowRight className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
