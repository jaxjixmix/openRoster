"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { useMoney } from "@/lib/currency";
import { errorMessage } from "@/lib/data";
import type { PayStub } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { fullName, hours } from "@/lib/format";
import { Button, Spinner } from "@/components/ui";

export default function PayStubPage() {
  const params = useParams<{ id: string }>();
  const { company } = useAuth();
  const money = useMoney();
  const [stub, setStub] = useState<PayStub | null>(null);
  const [error, setError] = useState("");
  const tz = company?.timezone || "America/Los_Angeles";

  useEffect(() => {
    pb.collection("pay_stubs")
      .getOne<PayStub>(params.id, { expand: "employee,pay_run" })
      .then(setStub)
      .catch((err) => setError(errorMessage(err)));
  }, [params.id]);

  if (error) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Could not load pay stub</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
      </div>
    );
  }
  if (!stub) return <Spinner label="Loading pay stub…" />;

  const employee = stub.expand?.employee;
  const run = stub.expand?.pay_run;
  const employerLines = (stub.breakdown || []).filter((line) => line.employer);
  const employeeLines = (stub.breakdown || []).filter((line) => !line.employer);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden mb-4 flex items-center justify-between">
        <Link href="/payroll" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-3.5" /> Payroll
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print / Save PDF
        </Button>
      </div>

      <div className="panel-raised overflow-hidden">
        <div className="flex items-start justify-between border-b border-line px-8 py-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Pay statement</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{company?.name || "OpenRoster"}</h1>
            <p className="mt-1 text-xs text-muted">{company?.address || ""}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p className="font-semibold text-ink">{fullName(employee)}</p>
            <p>{employee?.email || ""}</p>
            <p>{employee?.employee_number || ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
          <div className="px-6 py-4">
            <p className="eyebrow">Pay period</p>
            <p className="mt-1 text-sm font-medium">
              {run ? `${formatDate(run.period_start, "UTC")} – ${formatDate(run.period_end, "UTC")}` : "—"}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="eyebrow">Pay date</p>
            <p className="mt-1 text-sm font-medium">{run?.pay_date ? formatDate(run.pay_date, "UTC") : "—"}</p>
          </div>
          <div className="px-6 py-4">
            <p className="eyebrow">Net pay</p>
            <p className="mt-1 text-xl font-semibold tabular">{money(stub.net_pay)}</p>
          </div>
        </div>

        <div className="grid gap-8 px-8 py-6 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Earnings</p>
            <Row label={`Regular · ${hours(stub.regular_hours)}`} value={money(stub.regular_pay)} />
            <Row label={`Overtime · ${hours(stub.overtime_hours)}`} value={money(stub.overtime_pay)} />
            <Row label={`PTO · ${hours(stub.pto_hours)}`} value={money(stub.pto_pay)} />
            <Row label="Gross pay" value={money(stub.gross_pay)} strong />
          </div>
          <div>
            <p className="eyebrow mb-2">Withholdings</p>
            {employeeLines.map((line) => (
              <Row key={line.name} label={line.name} value={`− ${money(line.amount)}`} />
            ))}
            <Row label="Total employee taxes" value={money(stub.employee_taxes)} />
            <Row label="Total deductions" value={money(stub.employee_deductions)} />
            <Row label="Net pay" value={money(stub.net_pay)} strong />
          </div>
        </div>

        {employerLines.length > 0 && (
          <div className="border-t border-line px-8 py-4">
            <p className="eyebrow mb-2">Employer contributions (not deducted)</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              {employerLines.map((line) => (
                <span key={line.name}>{line.name}: {money(line.amount)}</span>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-line bg-[#f7f4ec] px-8 py-4 text-[10px] leading-relaxed text-muted">
          Alpha software. This statement is a preview generated from approved hours and configured rates.
          It is not a tax document and may not match a payroll provider. Keep the original records for audit.
          Generated for {formatDate(new Date().toISOString(), tz)}.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between border-b border-line/70 py-1.5 text-xs last:border-0 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="font-mono tabular">{value}</span>
    </div>
  );
}
