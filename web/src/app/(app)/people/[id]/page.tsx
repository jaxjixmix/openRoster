"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Clock3,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getAvailability,
  getCertifications,
  getDepartments,
  getDocuments,
  getEmployeeCertifications,
  getEmployee,
  getLocations,
  getPositions,
  getPtoEntries,
  getPunchesBetween,
  getShiftsBetween,
  getTimeOff,
  getTimesheets,
} from "@/lib/data";
import type {
  Availability,
  Certification,
  Department,
  DocumentRecord,
  Employee,
  EmployeeCertification,
  Location,
  Position,
  PtoEntry,
  Punch,
  Shift,
  TimeOffRequest,
  Timesheet,
} from "@/lib/types";
import {
  addDaysStr,
  durationHours,
  formatDate,
  formatTime,
  todayIn,
  toUtcIso,
  weekStart,
  toDate,
} from "@/lib/dates";
import { employmentLabel, fullName, hours, titleCase } from "@/lib/format";
import { useMoney } from "@/lib/currency";
import {
  Avatar,
  Badge,
  Button,
  Input,
  Label,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { ShiftRow } from "@/components/shift-row";
import { PersonModal } from "@/components/person-modal";
import { useToast } from "@/lib/toast";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function PersonPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { company, user, employee: me } = useAuth();
  const toast = useToast();
  const money = useMoney();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const weekStartDate = weekStart(today, Number(company?.week_start ?? "1"));

  const [person, setPerson] = useState<Employee | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [employeeCertifications, setEmployeeCertifications] = useState<EmployeeCertification[]>([]);
  const [ptoEntries, setPtoEntries] = useState<PtoEntry[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [availForm, setAvailForm] = useState({ weekday: "1", start: "09:00", end: "17:00" });
  const [availBusy, setAvailBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ptoOpen, setPtoOpen] = useState(false);
  const [ptoForm, setPtoForm] = useState({ type: "adjustment", hours: "0", note: "" });
  const [certOpen, setCertOpen] = useState(false);
  const [certForm, setCertForm] = useState({ certification: "", issued_at: "", expires_at: "", note: "" });

  const load = useCallback(async () => {
    if (!id || !company) return;
    try {
      const weekIso = toUtcIso(weekStartDate, "00:00", tz);
      const weekEnd = toUtcIso(addDaysStr(weekStartDate, 7), "00:00", tz);
      const monthAgo = toUtcIso(addDaysStr(today, -30), "00:00", tz);
      const tomorrow = toUtcIso(addDaysStr(today, 1), "00:00", tz);
      const [p, s, av, off, pu, ts, docs, pto, certs, employeeCerts, locs, depts, pos] = await Promise.all([
        getEmployee(id),
        getShiftsBetween(weekIso, addDaysStr(weekEnd.slice(0, 10), 30) + " 00:00:00.000Z", { employee: id }),
        getAvailability(id),
        getTimeOff({ employee: id }),
        getPunchesBetween(id, monthAgo, tomorrow),
        getTimesheets({ employee: id }),
        getDocuments(id),
        getPtoEntries(id),
        getCertifications(),
        getEmployeeCertifications(id),
        getLocations(),
        getDepartments(),
        getPositions(),
      ]);
      setPerson(p);
      setShifts(s);
      setAvailability(av);
      setTimeOff(off);
      setPunches(pu);
      setSheets(ts);
      setDocuments(docs);
      setPtoEntries(pto);
      setCertifications(certs);
      setEmployeeCertifications(employeeCerts);
      setLocations(locs);
      setDepartments(depts);
      setPositions(pos);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [company, id, today, tz, weekStartDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekShifts = useMemo(() => {
    const from = toDate(toUtcIso(weekStartDate, "00:00", tz)).getTime();
    const to = toDate(toUtcIso(addDaysStr(weekStartDate, 7), "00:00", tz)).getTime();
    return shifts.filter((s) => {
      const ts = toDate(s.starts_at).getTime();
      return ts >= from && ts < to;
    });
  }, [shifts, weekStartDate, tz]);
  const upcoming = useMemo(
    () => shifts.filter((s) => +toDate(s.ends_at) > Date.now()).slice(0, 6),
    [shifts],
  );
  const weekHours = weekShifts.reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
  const byDay = useMemo(() => {
    const map: Record<string, Availability[]> = {};
    for (const a of availability) {
      const key = a.weekday;
      map[key] = map[key] || [];
      map[key].push(a);
    }
    return map;
  }, [availability]);

  async function toggleArchive() {
    if (!person) return
    const archiving = person.status !== "archived"
    const message = archiving
      ? `Archive ${fullName(person)}? They will disappear from scheduling; payroll history stays intact.`
      : `Restore ${fullName(person)} to the active roster?`
    if (!window.confirm(message)) return
    try {
      await pb.collection("employees").update(person.id, {
        status: archiving ? "archived" : "active",
        archived_at: archiving ? new Date().toISOString() : "",
      })
      await load()
      toast(archiving ? "Person archived." : "Person restored.")
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  async function addCertification() {
    if (!person || !company) return
    try {
      if (!certForm.certification) throw new Error("Choose a certification.")
      await pb.collection("employee_certifications").create({
        company: company.id,
        employee: person.id,
        certification: certForm.certification,
        issued_at: certForm.issued_at ? `${certForm.issued_at} 00:00:00.000Z` : undefined,
        expires_at: certForm.expires_at ? `${certForm.expires_at} 00:00:00.000Z` : undefined,
        note: certForm.note || undefined,
      })
      setCertOpen(false)
      setCertForm({ certification: "", issued_at: "", expires_at: "", note: "" })
      await load()
      toast("Certification added.")
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  async function removeCertification(row: EmployeeCertification) {
    if (!window.confirm("Remove this certification?")) return
    try {
      await pb.collection("employee_certifications").delete(row.id)
      await load()
      toast("Certification removed.", "info")
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  async function adjustPto() {
    if (!person) return;
    try {
      const hours = Number(ptoForm.hours)
      if (!hours) throw new Error("Enter a positive or negative adjustment.")
      await pb.collection("pto_entries").create({
        company: person.company,
        employee: person.id,
        date: new Date().toISOString(),
        type: ptoForm.type,
        hours,
        note: ptoForm.note || "Manual adjustment",
      })
      setPtoOpen(false)
      setPtoForm({ type: "adjustment", hours: "0", note: "" })
      await load()
      toast("PTO balance updated.")
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  async function addAvailability() {
    if (!person) return;
    setAvailBusy(true);
    try {
      if (availForm.start >= availForm.end) throw new Error("End time must be after start time.");
      await pb.collection("availability").create({
        employee: person.id,
        weekday: availForm.weekday,
        start_time: availForm.start,
        end_time: availForm.end,
      });
      await load();
      toast("Availability window added.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setAvailBusy(false);
    }
  }

  async function removeAvailability(slot: Availability) {
    if (!window.confirm("Remove this availability window?")) return;
    try {
      await pb.collection("availability").delete(slot.id);
      await load();
      toast("Availability removed.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function uploadDocument(file: File | null) {
    if (!file || !person) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("employee", person.id);
      data.append("name", file.name);
      data.append("type", "other");
      data.append("file", file);
      await pb.collection("documents").create(data);
      await load();
      toast("Document uploaded.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(doc: DocumentRecord) {
    if (!doc.file) return;
    try {
      const token = await pb.files.getToken();
      const url = pb.files.getURL(doc, doc.file);
      window.open(`${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function removeDocument(doc: DocumentRecord) {
    if (!window.confirm(`Delete ${doc.name}?`)) return;
    try {
      await pb.collection("documents").delete(doc.id);
      await load();
      toast("Document deleted.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (loading) return <Spinner label="Loading profile…" />;
  if (error || !person) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Could not load this person</p>
        <p className="mt-1 text-sm text-muted">{error || "Not found."}</p>
        <Link href="/people" className="mt-4 inline-block text-sm text-accent">Back to people</Link>
      </div>
    );
  }

  const canManage = user?.role === "admin" || user?.role === "manager";
  const isSelf = user?.id === person.user || me?.id === person.id;
  const canEditProfile = canManage;
  const canEditAvailability = canManage || isSelf;
  const tenureStart = person.hire_date ? toDate(person.hire_date) : null;
  const tenureMonths = tenureStart ? Math.max(0, Math.floor((Date.now() - tenureStart.getTime()) / (30 * 86400000))) : 0;

  return (
    <div className="fade-in">
      <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> All people
      </Link>

      <div className="panel-raised mb-5 overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <Avatar name={fullName(person)} id={person.id} size="xl" className="ring-4 ring-[#f2eee3]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{fullName(person)}</h1>
              <Badge tone={person.status === "active" ? "success" : person.status === "archived" ? "neutral" : "danger"}>{person.status}</Badge>
              {person.expand?.user && <Badge tone={person.expand.user.role === "admin" ? "dark" : person.expand.user.role === "manager" ? "sage" : "neutral"}>{person.expand.user.role}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {person.expand?.position?.name || "No position"} · {person.expand?.department?.name || "Unassigned"}
              {person.expand?.location ? ` · ${person.expand.location.name}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>{person.email || "No email"}</span>
              {person.phone && <span>{person.phone}</span>}
              {person.employee_number && <span className="font-mono">{person.employee_number}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditProfile && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit profile
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={() => void toggleArchive()}>
                {person.status === "archived" ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {person.status === "archived" ? "Restore" : "Archive"}
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
          {[
            ["This week", hours(weekHours), `${weekShifts.length} shifts`],
            ["PTO balance", hours(person.pto_balance_hours), "Available"],
            [person.pay_type === "salary" ? "Salary" : "Hourly rate", person.pay_type === "salary" ? money(person.pay_rate) : `${money(person.pay_rate)}/hr`, titleCase(person.pay_type)],
            ["Tenure", tenureMonths >= 12 ? `${(tenureMonths / 12).toFixed(1)} yrs` : `${tenureMonths} mo`, person.hire_date ? formatDate(person.hire_date, "UTC") : "—"],
          ].map(([label, value, hint]) => (
            <div key={label} className="border-r border-line px-5 py-4 last:border-r-0">
              <p className="eyebrow">{label}</p>
              <p className="mt-1 text-lg font-semibold tracking-tight tabular">{value}</p>
              <p className="text-[10px] text-muted">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Upcoming shifts</p>
                <p className="mt-0.5 text-xs text-muted">Next 30 days</p>
              </div>
              <Link href="/schedule" className="text-xs font-medium text-accent">Schedule</Link>
            </div>
            <div className="space-y-2 p-4">
              {upcoming.length === 0 && <p className="py-6 text-center text-xs text-muted">No upcoming shifts.</p>}
              {upcoming.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} tz={tz} showDate />
              ))}
            </div>
          </section>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Weekly availability</p>
                <p className="mt-0.5 text-xs text-muted">Used by auto-fill to respect their time</p>
              </div>
              <Badge tone="neutral">{availability.length} windows</Badge>
            </div>
            <div className="divide-y divide-line">
              {WEEKDAYS.map((day, index) => (
                <div key={day} className="flex items-start gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-xs text-muted">{day}</span>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {(byDay[String(index)] || []).length === 0 && <span className="text-xs text-muted/60">Unavailable</span>}
                    {(byDay[String(index)] || []).map((w) => (
                      <span key={w.id} className="inline-flex items-center gap-1 rounded-md bg-[#eef0e7] px-2 py-1 font-mono text-[10px] text-[#3e5b3d]">
                        {w.start_time}–{w.end_time}
                        {canEditAvailability && (
                          <button onClick={() => removeAvailability(w)} className="text-[#7f8f77] hover:text-danger" title="Remove">
                            <Trash2 className="size-2.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {canEditAvailability && (
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-t border-line bg-[#f7f4ec] p-3">
                <Select value={availForm.weekday} onChange={(e) => setAvailForm({ ...availForm, weekday: e.target.value })} className="h-9 text-xs">
                  {WEEKDAYS.map((day, index) => <option key={day} value={String(index)}>{day.slice(0, 3)}</option>)}
                </Select>
                <Input type="time" value={availForm.start} onChange={(e) => setAvailForm({ ...availForm, start: e.target.value })} className="h-9 text-xs" />
                <Input type="time" value={availForm.end} onChange={(e) => setAvailForm({ ...availForm, end: e.target.value })} className="h-9 text-xs" />
                <Button size="sm" onClick={addAvailability} loading={availBusy}><Plus className="size-3.5" /> Add</Button>
              </div>
            )}
          </section>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">Documents</p>
              {canManage && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[11px] font-medium transition hover:border-line-strong">
                  <Upload className="size-3" />
                  {uploading ? "Uploading…" : "Upload"}
                  <input type="file" className="hidden" onChange={(e) => void uploadDocument(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
            <div className="divide-y divide-line">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="size-4 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{doc.name}</p>
                    <p className="text-[10px] text-muted">{formatDate(doc.created, "UTC")}</p>
                  </div>
                  <button
                    onClick={() => void openDocument(doc)}
                    className="text-[11px] text-accent hover:text-accent-deep"
                  >
                    Open
                  </button>
                  {canManage && (
                    <button onClick={() => void removeDocument(doc)} className="text-muted hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {documents.length === 0 && <p className="px-5 py-6 text-center text-xs text-muted">No documents uploaded.</p>}
            </div>
          </section>
        </div>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Certifications</p>
                <p className="mt-0.5 text-xs text-muted">Required for positions and shift assignment.</p>
              </div>
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setCertOpen(true)}>
                  <Plus className="size-3.5" /> Add
                </Button>
              )}
            </div>
            <div className="divide-y divide-line">
              {employeeCertifications.map((row) => {
                const expired = row.expires_at ? row.expires_at.slice(0, 10) < today : false
                return (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{row.expand?.certification?.name || "Certification"}</p>
                      <p className="text-[10px] text-muted">
                        {row.issued_at ? `Issued ${formatDate(row.issued_at, "UTC")}` : "No issue date"}
                        {row.expires_at ? ` · ${expired ? "Expired" : "Expires"} ${formatDate(row.expires_at, "UTC")}` : " · No expiry"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={expired ? "danger" : "success"}>{expired ? "Expired" : "Valid"}</Badge>
                      {canManage && (
                        <button onClick={() => void removeCertification(row)} className="text-muted hover:text-danger" title="Remove">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {employeeCertifications.length === 0 && <p className="px-5 py-6 text-center text-xs text-muted">No certifications on file.</p>}
            </div>
          </section>

        <div className="space-y-5">
          <section className="panel-raised p-5">
            <p className="text-sm font-semibold">Profile</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Detail label="Employment" value={employmentLabel(person.employment_type)} />
              <Detail label="Pay type" value={titleCase(person.pay_type)} />
              <Detail label="Max weekly" value={hours(person.max_weekly_hours)} />
              <Detail label="Overtime" value={person.overtime_exempt ? "Exempt" : "Eligible"} />
              <Detail label="Hire date" value={person.hire_date ? formatDate(person.hire_date, "UTC") : "—"} />
              <Detail label="Manager" value={person.expand?.manager ? fullName(person.expand.manager) : "—"} />
            </div>
            {person.notes && (
              <div className="mt-4 rounded-lg bg-[#f4f1e9] p-3 text-xs text-muted">{person.notes}</div>
            )}
          </section>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">Time off</p>
              <Badge tone="neutral">{timeOff.length}</Badge>
            </div>
            <div className="divide-y divide-line">
              {timeOff.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div>
                    <p className="text-xs font-medium">{titleCase(r.type)}</p>
                    <p className="text-[10px] text-muted">
                      {formatDate(r.start_date, "UTC")} – {formatDate(r.end_date, "UTC")} · {hours(r.hours)}
                    </p>
                  </div>
                  <Badge tone={r.status === "approved" ? "success" : r.status === "denied" ? "danger" : "warning"}>{r.status}</Badge>
                </div>
              ))}
              {timeOff.length === 0 && <p className="px-5 py-6 text-center text-xs text-muted">No requests.</p>}
            </div>
          </section>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">PTO ledger</p>
                <p className="mt-0.5 text-xs text-muted">Balance {hours(person.pto_balance_hours)}</p>
              </div>
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setPtoOpen(true)}>
                  <Plus className="size-3.5" /> Adjust
                </Button>
              )}
            </div>
            <div className="divide-y divide-line">
              {ptoEntries.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium capitalize">{entry.type}</p>
                    <p className="truncate text-[10px] text-muted">
                      {formatDate(entry.date, "UTC")} · {entry.note || "—"}
                    </p>
                  </div>
                  <span className={`font-mono text-xs tabular ${entry.hours < 0 ? "text-accent" : "text-sage"}`}>
                    {entry.hours > 0 ? "+" : ""}{hours(entry.hours)}
                  </span>
                </div>
              ))}
              {ptoEntries.length === 0 && <p className="px-5 py-6 text-center text-xs text-muted">No ledger entries yet.</p>}
            </div>
          </section>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">Recent punches</p>
              <Badge tone="neutral">{punches.length}</Badge>
            </div>
            <div className="divide-y divide-line">
              {punches.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                  <span className="flex items-center gap-2 text-muted">
                    <Clock3 className="size-3" />
                    {formatDate(p.punched_at, tz)}
                  </span>
                  <span className={`font-mono text-[11px] ${p.type === "in" ? "text-sage" : "text-accent"}`}>
                    {p.type === "in" ? "in" : "out"} {formatTime(p.punched_at, tz)}
                  </span>
                </div>
              ))}
              {punches.length === 0 && <p className="px-5 py-6 text-center text-xs text-muted">No punches yet.</p>}
            </div>
          </section>

          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">Pay history</p>
            </div>
            <div className="divide-y divide-line">
              {sheets.slice(0, 4).map((s) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-xs font-medium">{formatDate(s.period_start, "UTC")} – {formatDate(s.period_end, "UTC")}</p>
                    <p className="text-[10px] text-muted">{hours(s.total_hours)} · {titleCase(s.status)}</p>
                  </div>
                  <span className="font-mono text-xs tabular">{money((s.regular_hours || 0) * (person.pay_rate || 0))}</span>
                </div>
              ))}
              {sheets.length === 0 && <p className="px-5 py-6 text-center text-xs text-muted">No timesheets yet.</p>}
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={ptoOpen}
        onClose={() => setPtoOpen(false)}
        title="Adjust PTO"
        description="Positive adds hours; negative deducts. This writes an auditable ledger entry."
        footer={<><Button variant="ghost" onClick={() => setPtoOpen(false)}>Cancel</Button><Button onClick={adjustPto}>Save adjustment</Button></>}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select value={ptoForm.type} onChange={(e) => setPtoForm({ ...ptoForm, type: e.target.value })}>
                <option value="adjustment">Adjustment</option>
                <option value="accrual">Accrual</option>
                <option value="carryover">Carryover</option>
              </Select>
            </div>
            <div>
              <Label>Hours</Label>
              <Input type="number" step="0.25" value={ptoForm.hours} onChange={(e) => setPtoForm({ ...ptoForm, hours: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Input value={ptoForm.note} onChange={(e) => setPtoForm({ ...ptoForm, note: e.target.value })} placeholder="Why this adjustment?" />
          </div>
        </div>
      </Modal>

      <Modal
        open={certOpen}
        onClose={() => setCertOpen(false)}
        title="Add certification"
        footer={<><Button variant="ghost" onClick={() => setCertOpen(false)}>Cancel</Button><Button onClick={addCertification}>Add certification</Button></>}
      >
        <div className="space-y-4">
          <div>
            <Label>Certification</Label>
            <Select value={certForm.certification} onChange={(e) => setCertForm({ ...certForm, certification: e.target.value })}>
              <option value="">Choose a certification</option>
              {certifications.filter((certification) => certification.active !== false).map((certification) => (
                <option key={certification.id} value={certification.id}>{certification.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Issued</Label><Input type="date" value={certForm.issued_at} onChange={(e) => setCertForm({ ...certForm, issued_at: e.target.value })} /></div>
            <div><Label>Expires</Label><Input type="date" value={certForm.expires_at} onChange={(e) => setCertForm({ ...certForm, expires_at: e.target.value })} /></div>
          </div>
          <div><Label>Note</Label><Input value={certForm.note} onChange={(e) => setCertForm({ ...certForm, note: e.target.value })} /></div>
        </div>
      </Modal>

      <PersonModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        employee={person}
        locations={locations}
        departments={departments}
        positions={positions}
        onSaved={load}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-xs font-medium">{value}</p>
    </div>
  );
}
