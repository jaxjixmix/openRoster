"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Inbox, X } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { errorMessage, getBlackoutDates, getEmployees, getTimeOff } from "@/lib/data";
import type { BlackoutDate, Employee, TimeOffRequest } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { fullName, hours, titleCase } from "@/lib/format";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/lib/toast";

export default function RequestsPage() {
  const { user, employee, isManager } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<"pending" | "approved" | "denied" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    employee: employee?.id || "",
    type: "vacation",
    start_date: "",
    end_date: "",
    hours: "8",
    note: "",
  });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const [rows, emps, blackoutRows] = await Promise.all([
        getTimeOff(isManager ? {} : { employee: employee?.id }),
        isManager ? getEmployees() : Promise.resolve([]),
        getBlackoutDates(),
      ]);
      setRequests(rows);
      setEmployees(emps);
      setBlackouts(blackoutRows);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [employee?.id, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (employee && !form.employee) setForm((f) => ({ ...f, employee: employee.id }));
  }, [employee, form.employee]);

  const blackoutOverlap = useMemo(() => {
    if (!form.start_date || !form.end_date) return null;
    return blackouts.find((row) =>
      row.start_date.slice(0, 10) <= form.end_date && row.end_date.slice(0, 10) >= form.start_date,
    ) || null;
  }, [blackouts, form.start_date, form.end_date]);

  const filtered = useMemo(
    () => (tab === "all" ? requests : requests.filter((r) => r.status === tab)),
    [requests, tab],
  );

  const pending = requests.filter((r) => r.status === "pending");
  const approvedHours = requests
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + (r.hours || 0), 0);

  async function setStatus(request: TimeOffRequest, status: "approved" | "denied") {
    try {
      await pb.collection("time_off_requests").update(request.id, {
        status,
        approved_by: user?.id,
      });
      await load();
      toast(`Request ${status}.`, status === "approved" ? "success" : "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function submit() {
    setBusy(true);
    setFormError("");
    try {
      if (!form.employee) throw new Error("Choose an employee.");
      if (!form.start_date || !form.end_date) throw new Error("Start and end dates are required.");
      if (form.end_date < form.start_date) throw new Error("End date must be on or after the start date.");
      await pb.collection("time_off_requests").create({
        employee: form.employee,
        type: form.type,
        start_date: `${form.start_date} 00:00:00.000Z`,
        end_date: `${form.end_date} 00:00:00.000Z`,
        hours: Number(form.hours) || 0,
        note: form.note || undefined,
      });
      setModalOpen(false);
      setForm({ employee: employee?.id || "", type: "vacation", start_date: "", end_date: "", hours: "8", note: "" });
      await load();
      toast("Time off request sent.");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading time off…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Time off"
        title="Requests"
        description={
          isManager
            ? "Approve time off before it collides with the schedule."
            : "Ask for time off and keep an eye on approval."
        }
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <CalendarPlus className="size-4" /> Request time off
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending" value={pending.length} hint={isManager ? "Awaiting your review" : "Awaiting manager"} icon={<Inbox className="size-4" />} tone={pending.length ? "accent" : "sage"} />
        <StatCard label="Approved hours" value={hours(approvedHours)} hint="This list" tone="sage" />
        <StatCard label="PTO balance" value={hours(employee?.pto_balance_hours || 0)} hint={isManager ? "Your own balance" : "Available to use"} tone="gold" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pending", label: "Pending", count: pending.length },
          { value: "approved", label: "Approved", count: requests.filter((r) => r.status === "approved").length },
          { value: "denied", label: "Denied", count: requests.filter((r) => r.status === "denied").length },
          { value: "all", label: "All", count: requests.length },
        ]}
      />

      <div className="mt-4 panel-raised overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Inbox className="size-5" />}
              title={tab === "pending" ? "Nothing waiting" : "No requests here"}
              description={tab === "pending" ? "The queue is clear." : "Requests will appear here once submitted."}
              action={<Button size="sm" onClick={() => setModalOpen(true)}><CalendarPlus className="size-3.5" /> Request time off</Button>}
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={fullName(request.expand?.employee)} id={request.employee} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-semibold">{fullName(request.expand?.employee)}</p>
                      <Badge tone={request.status === "approved" ? "success" : request.status === "denied" ? "danger" : "warning"}>
                        {request.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {titleCase(request.type)} · {formatDate(request.start_date, "UTC")}
                      {request.start_date.slice(0, 10) !== request.end_date.slice(0, 10) && ` – ${formatDate(request.end_date, "UTC")}`}
                      {request.hours ? ` · ${hours(request.hours)}` : ""}
                    </p>
                    {request.note && <p className="mt-1 text-[11px] text-muted">{request.note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  {isManager && request.status === "pending" ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setStatus(request, "denied")}>
                        <X className="size-3.5" /> Deny
                      </Button>
                      <Button size="sm" onClick={() => setStatus(request, "approved")}>
                        <Check className="size-3.5" /> Approve
                      </Button>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted">
                      {request.status === "approved" ? "Approved" : request.status === "denied" ? "Not approved" : "Waiting on manager"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Request time off"
        description={isManager ? "Enter a request for yourself or a team member." : "Your manager will see this in their queue."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy}>Send request</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorNote>{formError}</ErrorNote>}
          {isManager && (
            <div>
              <Label>Employee</Label>
              <Select value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}>
                <option value="">Choose a person</option>
                {employees.filter((e) => e.status === "active").map((emp) => (
                  <option key={emp.id} value={emp.id}>{fullName(emp)}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="unpaid">Unpaid</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <Label>Hours</Label>
              <Input type="number" min="0" step="1" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.end_date || e.target.value })} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          {blackoutOverlap && (
            <div className="rounded-lg border border-[#e6d4ac] bg-[#fbf2dd] px-3 py-2 text-[11px] text-[#82621c]">
              These dates overlap a blackout: <strong>{blackoutOverlap.name}</strong>. You can still submit; a manager will decide.
            </div>
          )}
          <div>
            <Label>Note</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Anything your manager should know." rows={3} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
