"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileText,
  Play,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getEmployees,
  getPayRuns,
  getPayRules,
  getPayStubs,
  getTimesheets,
} from "@/lib/data";
import type { Employee, PayRule, PayRun, PayStub, PayrollPreview, Timesheet } from "@/lib/types";
import {
  addDaysStr,
  formatDate,
  monthDay,
  todayIn,
  weekStart,
} from "@/lib/dates";
import { fullName, hours, money, titleCase } from "@/lib/format";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatCard,
  Tabs,
} from "@/components/ui";
import { useToast } from "@/lib/toast";

export default function PayrollPage() {
  const { company, isManager } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const defaultStart = weekStart(today, Number(company?.week_start ?? "1"));
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(addDaysStr(defaultStart, 6));
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [rules, setRules] = useState<PayRule[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"current" | "history" | "rules">("current");
  const [detailRun, setDetailRun] = useState<PayRun | null>(null);
  const [detailStubs, setDetailStubs] = useState<PayStub[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [emps, history, payRules, previewRes, sheetsRes] = await Promise.all([
        getEmployees(),
        getPayRuns(),
        getPayRules(),
        pb.send<PayrollPreview>("/api/openroster/payroll/preview", {
          method: "POST",
          body: { period_start: periodStart, period_end: periodEnd },
        }),
        getTimesheets({
          periodStart: `${periodStart} 00:00:00.000Z`,
          periodEnd: `${periodEnd} 23:59:59.999Z`,
        }),
      ]);
      setEmployees(emps);
      setRuns(history);
      setRules(payRules);
      setPreview(previewRes);
      setSheets(sheetsRes);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    if (!isManager) return;
    void load();
  }, [load, isManager]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const approvedCount = sheets.filter((s) => s.status === "approved" || s.status === "paid").length;
  const pendingCount = sheets.filter((s) => s.status !== "approved" && s.status !== "paid").length;

  async function runPayroll() {
    setBusy(true);
    try {
      const res = await pb.send<PayrollPreview>("/api/openroster/payroll/run", {
        method: "POST",
        body: { period_start: periodStart, period_end: periodEnd },
      });
      await load();
      toast(`Draft pay run created for ${res.totals.employees} people.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function setRunStatus(run: PayRun, status: "approved" | "paid") {
    setBusy(true);
    try {
      await pb.collection("pay_runs").update(run.id, { status });
      if (status === "paid") {
        const periodSheets = await getTimesheets({
          periodStart: `${run.period_start.slice(0, 10)} 00:00:00.000Z`,
          periodEnd: `${run.period_end.slice(0, 10)} 23:59:59.999Z`,
        });
        await Promise.all(
          periodSheets
            .filter((s) => s.status === "approved")
            .map((s) => pb.collection("timesheets").update(s.id, { status: "paid" })),
        );
      }
      await load();
      toast(`Pay run marked ${status}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function openRun(run: PayRun) {
    setDetailRun(run);
    try {
      setDetailStubs(await getPayStubs(run.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (!isManager) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Manager access required</p>
        <p className="mt-1 text-sm text-muted">Payroll is restricted to managers and administrators.</p>
      </div>
    );
  }

  if (loading) return <Spinner label="Building payroll preview…" />;

  const totals = preview?.totals;
  const employerCost = (totals?.gross || 0) + (preview?.stubs.reduce((s, x) => s + x.employer_taxes, 0) || 0);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Pay"
        title="Payroll"
        description="Turn approved hours into a draft pay run. No tax filing, no surprises."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} loading={busy}>
              <Play className="size-3.5" /> Recalculate
            </Button>
            <Button size="sm" onClick={runPayroll} loading={busy} disabled={!preview?.stubs.length}>
              <Download className="size-3.5" /> Create draft run
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label mb-1.5 block">Period start</label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => {
              setPeriodStart(e.target.value);
              setPeriodEnd(addDaysStr(e.target.value, 6));
            }}
          />
        </div>
        <div>
          <label className="label mb-1.5 block">Period end</label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Badge tone={pendingCount ? "warning" : "success"}>
            {approvedCount} approved · {pendingCount} pending
          </Badge>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "current", label: "Current period" },
          { value: "history", label: "Pay runs", count: runs.length },
          { value: "rules", label: "Pay rules", count: rules.length },
        ]}
      />

      {tab === "current" && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="People paid" value={totals?.employees || 0} hint="Approved timesheets + salaried" icon={<Wallet className="size-4" />} tone="neutral" />
            <StatCard label="Gross pay" value={money(totals?.gross)} hint="Before withholdings" tone="sage" />
            <StatCard label="Employee taxes" value={money(totals?.taxes)} hint={`${money(totals?.deductions)} deductions`} tone="accent" />
            <StatCard label="Net pay" value={money(totals?.net)} hint={`Employer cost ${money(employerCost)}`} tone="gold" />
          </div>

          <div className="mt-5 panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Pay preview</p>
                <p className="mt-0.5 text-xs text-muted">
                  {monthDay(periodStart)} – {monthDay(periodEnd)} · {preview?.stubs.length || 0} stubs
                </p>
              </div>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#82621c]">
                  <AlertTriangle className="size-3.5" /> {pendingCount} timesheets excluded
                </span>
              )}
            </div>

            {!preview?.stubs.length ? (
              <div className="p-6">
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title="Nothing to pay yet"
                  description="Approve timesheets for this period first, then recalculate. Salaried staff are included automatically."
                  action={
                    <Button variant="outline" size="sm" onClick={() => router.push("/timesheets")}>
                      Go to timesheets
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[1.6fr_0.9fr_repeat(4,0.8fr)_0.5fr] items-center gap-3 border-b border-line bg-[#f7f4ec] px-5 py-2.5 lg:grid">
                  <span className="table-head">Employee</span>
                  <span className="table-head text-right">Hours</span>
                  <span className="table-head text-right">Gross</span>
                  <span className="table-head text-right">Taxes</span>
                  <span className="table-head text-right">Deductions</span>
                  <span className="table-head text-right">Net</span>
                  <span />
                </div>
                <div className="divide-y divide-line">
                  {preview.stubs.map((stub) => {
                    const emp = employeeById.get(stub.employee);
                    const totalHours = stub.regular_hours + stub.overtime_hours + stub.pto_hours;
                    const open = expanded === stub.employee;
                    return (
                      <div key={stub.employee}>
                        <button
                          onClick={() => setExpanded(open ? null : stub.employee)}
                          className="grid w-full grid-cols-2 items-center gap-3 px-5 py-3 text-left transition hover:bg-black/[0.02] lg:grid-cols-[1.6fr_0.9fr_repeat(4,0.8fr)_0.5fr]"
                        >
                          <div className="col-span-2 flex items-center gap-2.5 lg:col-span-1">
                            <Avatar name={fullName(emp)} id={stub.employee} size="sm" />
                            <div>
                              <p className="text-xs font-semibold">{fullName(emp)}</p>
                              <p className="text-[10px] text-muted">{emp?.expand?.position?.name || titleCase(emp?.pay_type || "")}</p>
                            </div>
                          </div>
                          <span className="text-right font-mono text-xs tabular text-muted">{hours(totalHours)}</span>
                          <span className="text-right font-mono text-xs tabular">{money(stub.gross_pay)}</span>
                          <span className="text-right font-mono text-xs tabular text-muted">{money(stub.employee_taxes)}</span>
                          <span className="text-right font-mono text-xs tabular text-muted">{money(stub.employee_deductions)}</span>
                          <span className="text-right font-mono text-xs font-semibold tabular">{money(stub.net_pay)}</span>
                          <ChevronDown className={`ml-auto size-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="border-t border-line bg-[#faf8f2] px-5 py-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="eyebrow mb-2">Earnings</p>
                                <Line label="Regular" value={money(stub.regular_pay)} hint={`${hours(stub.regular_hours)}`} />
                                <Line label="Overtime" value={money(stub.overtime_pay)} hint={`${hours(stub.overtime_hours)}`} />
                                <Line label="PTO" value={money(stub.pto_pay)} hint={`${hours(stub.pto_hours)}`} />
                              </div>
                              <div>
                                <p className="eyebrow mb-2">Withholdings</p>
                                {stub.breakdown.filter((l) => !l.employer).map((line) => (
                                  <Line key={line.name} label={line.name} value={`− ${money(line.amount)}`} hint={line.calc === "percent" ? `${line.rate}%` : line.calc.replaceAll("_", " ")} />
                                ))}
                                {stub.breakdown.filter((l) => l.employer).length > 0 && (
                                  <p className="mt-2 text-[10px] text-muted">
                                    Employer contributions: {money(stub.breakdown.filter((l) => l.employer).reduce((s, l) => s + l.amount, 0))}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-line bg-[#f7f4ec] px-5 py-3">
                  <span className="text-xs text-muted">Draft only — nothing is filed or paid automatically.</span>
                  <Button size="sm" onClick={runPayroll} loading={busy}>
                    <Download className="size-3.5" /> Create draft run
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="mt-5 panel-raised overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <p className="text-sm font-semibold">Pay runs</p>
            <p className="mt-0.5 text-xs text-muted">Draft, approved and paid periods.</p>
          </div>
          {runs.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<Wallet className="size-5" />} title="No pay runs yet" description="Create a draft from the current period." />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {runs.map((run) => (
                <div key={run.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold">{formatDate(run.period_start, "UTC")} – {formatDate(run.period_end, "UTC")}</p>
                      <Badge tone={run.status === "paid" ? "success" : run.status === "approved" ? "sage" : "warning"}>{run.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {run.pay_date ? `Pay date ${formatDate(run.pay_date, "UTC")} · ` : ""}Net {money(run.total_net)} · Gross {money(run.total_gross)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => void openRun(run)}>View</Button>
                    {run.status === "draft" && (
                      <Button variant="outline" size="sm" onClick={() => setRunStatus(run, "approved")} loading={busy}>Approve</Button>
                    )}
                    {run.status === "approved" && (
                      <Button size="sm" onClick={() => setRunStatus(run, "paid")} loading={busy}><ShieldCheck className="size-3.5" /> Mark paid</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "rules" && (
        <div className="mt-5 panel-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="text-sm font-semibold">Pay rules</p>
              <p className="mt-0.5 text-xs text-muted">Configured rates, not a tax engine. Adjust in Settings.</p>
            </div>
            <Badge tone="gold">{rules.filter((r) => r.active).length} active</Badge>
          </div>
          <div className="divide-y divide-line">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <p className="text-xs font-medium">{rule.name}</p>
                  <p className="text-[10px] text-muted">{titleCase(rule.type)} · {rule.calc.replaceAll("_", " ")} · {rule.employer ? "employer" : "employee"}</p>
                </div>
                <span className="font-mono text-xs tabular">{rule.calc === "percent" ? `${rule.rate}%` : money(rule.rate)}</span>
                <Badge tone={rule.active ? "success" : "neutral"}>{rule.active ? "Active" : "Off"}</Badge>
              </div>
            ))}
            {rules.length === 0 && <p className="px-5 py-8 text-center text-xs text-muted">No pay rules configured.</p>}
          </div>
        </div>
      )}

      <Modal
        open={!!detailRun}
        onClose={() => setDetailRun(null)}
        title="Pay run"
        description={detailRun ? `${formatDate(detailRun.period_start, "UTC")} – ${formatDate(detailRun.period_end, "UTC")} · ${detailRun.status}` : ""}
        width="lg"
      >
        {detailRun && (
          <div>
            <div className="grid grid-cols-4 gap-3 rounded-xl bg-[#f2eee3] p-4">
              {[
                ["Gross", money(detailRun.total_gross)],
                ["Taxes", money(detailRun.total_tax)],
                ["Deductions", money(detailRun.total_deductions)],
                ["Net", money(detailRun.total_net)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="eyebrow">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 divide-y divide-line rounded-xl border border-line">
              {detailStubs.map((stub) => (
                <div key={stub.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-xs font-medium">{fullName(stub.expand?.employee)}</p>
                    <p className="text-[10px] text-muted">{hours((stub.regular_hours || 0) + (stub.overtime_hours || 0) + (stub.pto_hours || 0))}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs">{money(stub.net_pay)}</p>
                    <p className="text-[10px] text-muted">net · {money(stub.gross_pay)} gross</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/70 py-1 text-xs last:border-0">
      <span className="text-muted">{label}{hint ? ` · ${hint}` : ""}</span>
      <span className="font-mono tabular">{value}</span>
    </div>
  );
}
