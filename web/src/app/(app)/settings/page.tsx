"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Building2,
  Download,
  CalendarDays,
  Check,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Tags,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getCertifications,
  getDepartments,
  getHolidays,
  getKioskDevices,
  getKioskPin,
  getLocations,
  createKioskDevice,
  revokeKioskDevice,
  getPayRules,
  getPositions,
  saveKioskPin,
} from "@/lib/data";
import type { Certification, Department, Holiday, KioskDevice, Location, PayRule, Position, User } from "@/lib/types";
import { formatDate, toDate } from "@/lib/dates";
import { roleLabel, titleCase } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { useMoney } from "@/lib/currency";
import {
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
  Tabs,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/lib/toast";

type Tab = "company" | "locations" | "departments" | "positions" | "certifications" | "pay" | "holidays" | "access" | "activity";

export default function SettingsPage() {
  const { company, user, isManager, refresh } = useAuth();
  const toast = useToast();
  const money = useMoney();
  const [tab, setTab] = useState<Tab>("company");
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [payRules, setPayRules] = useState<PayRule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companyForm, setCompanyForm] = useState({
    name: "",
    legal_name: "",
    timezone: "America/Los_Angeles",
    currency: "USD",
    locale: "en-US",
    ui_language: "auto",
    week_start: "1",
    pay_frequency: "biweekly",
    overtime_weekly_hours: "40",
    overtime_daily_hours: "8",
    overtime_multiplier: "1.5",
    pto_accrual_hours_per_period: "0",
    pto_accrual_hours_per_hour: "0",
    punch_rounding_minutes: "0",
    weekly_labor_budget: "0",
    expiry_reminder_days: "30",
    address: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [kioskPin, setKioskPin] = useState("");
  const [kioskSaving, setKioskSaving] = useState(false);
  const [kioskDevices, setKioskDevices] = useState<KioskDevice[]>([]);
  const [kioskDeviceName, setKioskDeviceName] = useState("Front desk tablet");
  const [kioskDeviceLocation, setKioskDeviceLocation] = useState("");
  const [kioskPairing, setKioskPairing] = useState<{ code: string; expires_at: string; name: string } | null>(null);
  const [kioskPairBusy, setKioskPairBusy] = useState(false);

  const [locationModal, setLocationModal] = useState<Location | "new" | null>(null);
  const [departmentModal, setDepartmentModal] = useState<Department | "new" | null>(null);
  const [positionModal, setPositionModal] = useState<Position | "new" | null>(null);
  const [certificationModal, setCertificationModal] = useState<Certification | "new" | null>(null);
  const [payModal, setPayModal] = useState<PayRule | "new" | null>(null);
  const [holidayModal, setHolidayModal] = useState<Holiday | "new" | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [locs, depts, pos, certs, rules, hols] = await Promise.all([
        getLocations(),
        getDepartments(),
        getPositions(),
        getCertifications(),
        getPayRules(),
        getHolidays(),
      ]);
      setLocations(locs);
      setKioskDeviceLocation((current) => current || locs[0]?.id || "");
      setDepartments(depts);
      setPositions(pos);
      setCertifications(certs);
      setPayRules(rules);
      setHolidays(hols);

      getKioskDevices().then(setKioskDevices).catch(() => {});

      if (isAdmin) {
        const [us, audit] = await Promise.all([
          pb.collection("users").getFullList<User>({ sort: "name" }),
          pb.collection("audit_log").getList(1, 50, { sort: "-at", expand: "actor" }),
        ]);
        setUsers(us);
        setActivity(audit.items as unknown as Array<Record<string, unknown>>);
      }
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!company) return;
    getKioskPin(company.id).then((record) => setKioskPin(record?.pin || "")).catch(() => {});
    setCompanyForm({
      name: company.name || "",
      legal_name: company.legal_name || "",
      timezone: company.timezone || "America/Los_Angeles",
      currency: company.currency || "USD",
      locale: company.locale || "en-US",
      ui_language: company.ui_language || "auto",
      week_start: company.week_start || "1",
      pay_frequency: company.pay_frequency || "biweekly",
      overtime_weekly_hours: String(company.overtime_weekly_hours ?? 40),
      overtime_daily_hours: String(company.overtime_daily_hours ?? 8),
      overtime_multiplier: String(company.overtime_multiplier ?? 1.5),
      pto_accrual_hours_per_period: String(company.pto_accrual_hours_per_period ?? 0),
      pto_accrual_hours_per_hour: String(company.pto_accrual_hours_per_hour ?? 0),
      punch_rounding_minutes: String(company.punch_rounding_minutes ?? 0),
      weekly_labor_budget: String(company.weekly_labor_budget ?? 0),
      expiry_reminder_days: String(company.expiry_reminder_days ?? 30),
      address: company.address || "",
      phone: company.phone || "",
    });
  }, [company]);

  async function saveCompany() {
    if (!company) return;
    setSaving(true);
    try {
      await pb.collection("companies").update(company.id, {
        ...companyForm,
        overtime_weekly_hours: Number(companyForm.overtime_weekly_hours),
        overtime_daily_hours: Number(companyForm.overtime_daily_hours),
        overtime_multiplier: Number(companyForm.overtime_multiplier),
        pto_accrual_hours_per_period: Number(companyForm.pto_accrual_hours_per_period),
        pto_accrual_hours_per_hour: Number(companyForm.pto_accrual_hours_per_hour),
        punch_rounding_minutes: Number(companyForm.punch_rounding_minutes),
        weekly_labor_budget: Number(companyForm.weekly_labor_budget),
        expiry_reminder_days: Number(companyForm.expiry_reminder_days),
      });
      await refresh();
      toast("Company settings saved.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function pairKiosk() {
    if (!kioskDeviceLocation) {
      toast("Choose a location for the tablet.", "error");
      return;
    }
    setKioskPairBusy(true);
    try {
      const result = await createKioskDevice(kioskDeviceName.trim() || "Kiosk tablet", kioskDeviceLocation);
      setKioskPairing({ code: result.code, expires_at: result.expires_at, name: result.device.name });
      setKioskDevices((items) => [result.device, ...items]);
      toast("Pairing code ready. It expires in 10 minutes.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setKioskPairBusy(false);
    }
  }

  async function revokeDevice(device: KioskDevice) {
    if (!window.confirm(`Revoke ${device.name}? Its punches stop immediately.`)) return;
    try {
      await revokeKioskDevice(device.id);
      setKioskDevices((items) => items.filter((item) => item.id !== device.id));
      toast("Kiosk revoked.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function saveKiosk() {
    if (!company) return;
    setKioskSaving(true);
    try {
      await saveKioskPin(company.id, kioskPin);
      toast(kioskPin.trim() ? "Kiosk PIN saved." : "Kiosk PIN removed.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setKioskSaving(false);
    }
  }

  async function remove(collection: string, id: string, label: string) {
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await pb.collection(collection).delete(id);
      await load();
      toast(`${label} deleted.`, "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function changeRole(member: User, role: string) {
    try {
      await pb.collection("users").update(member.id, { role });
      await load();
      toast(`${member.name} is now ${roleLabel(role)}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (!isManager) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Manager access required</p>
        <p className="mt-1 text-sm text-muted">Settings are restricted.</p>
      </div>
    );
  }

  if (loading || !company) return <Spinner label="Loading settings…" />;

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: "company", label: "Company" },
    { value: "locations", label: "Locations", count: locations.length },
    { value: "departments", label: "Departments", count: departments.length },
    { value: "positions", label: "Positions", count: positions.length },
    { value: "certifications", label: "Certifications", count: certifications.length },
    { value: "pay", label: "Pay rules", count: payRules.length },
    { value: "holidays", label: "Holidays", count: holidays.length },
  ];
  if (isAdmin) {
    tabs.push({ value: "access", label: "Access", count: users.length });
    tabs.push({ value: "activity", label: "Activity" });
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="The operating rules behind your roster, payroll and time clock."
      />
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      <div className="mt-5">
        {tab === "company" && (
          <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
            <section className="panel-raised p-5">
              <div className="mb-4 flex items-center gap-2">
                <Building2 className="size-4 text-muted" />
                <p className="text-sm font-semibold">Company profile</p>
              </div>
              <div className="space-y-4">
                <fieldset disabled={!isAdmin} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Display name</Label><Input value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} /></div>
                  <div><Label>Legal name</Label><Input value={companyForm.legal_name} onChange={(e) => setCompanyForm({ ...companyForm, legal_name: e.target.value })} /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Timezone</Label>
                    <Select value={companyForm.timezone} onChange={(e) => setCompanyForm({ ...companyForm, timezone: e.target.value })}>
                      {["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Singapore", "Australia/Sydney"].map((tz) => (
                        <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                      ))}
                    </Select>
                  </div>
                  <div><Label>Currency</Label><Input value={companyForm.currency} onChange={(e) => setCompanyForm({ ...companyForm, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
                  <div>
                    <Label>Locale</Label>
                    <Select value={companyForm.locale} onChange={(e) => setCompanyForm({ ...companyForm, locale: e.target.value })}>
                      {["en-US", "en-GB", "en-AU", "fr-FR", "de-DE", "es-ES", "pt-BR"].map((locale) => (
                        <option key={locale} value={locale}>{locale}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Week starts</Label>
                    <Select value={companyForm.week_start} onChange={(e) => setCompanyForm({ ...companyForm, week_start: e.target.value })}>
                      <option value="1">Monday</option>
                      <option value="0">Sunday</option>
                    </Select>
                  </div>
                  <div>
                    <Label>UI language</Label>
                    <Select value={companyForm.ui_language || "auto"} onChange={(e) => setCompanyForm({ ...companyForm, ui_language: e.target.value })}>
                      <option value="auto">Follow locale</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Address</Label><Input value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} /></div>
                </div>
                </fieldset>
                {isAdmin ? (
                  <Button onClick={saveCompany} loading={saving}><Check className="size-4" /> Save company</Button>
                ) : (
                  <p className="text-xs text-muted">Only an administrator can edit company settings.</p>
                )}
              </div>
            </section>

            <section className="panel-raised p-5">
              <div className="mb-4 flex items-center gap-2">
                <Wallet className="size-4 text-muted" />
                <p className="text-sm font-semibold">Payroll defaults</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Pay frequency</Label>
                  <Select value={companyForm.pay_frequency} onChange={(e) => setCompanyForm({ ...companyForm, pay_frequency: e.target.value })} disabled={!isAdmin}>
                    <option value="weekly">Weekly (52 periods)</option>
                    <option value="biweekly">Bi-weekly (26 periods)</option>
                    <option value="semimonthly">Semi-monthly (24 periods)</option>
                    <option value="monthly">Monthly (12 periods)</option>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>OT after / week</Label><Input type="number" value={companyForm.overtime_weekly_hours} onChange={(e) => setCompanyForm({ ...companyForm, overtime_weekly_hours: e.target.value })} disabled={!isAdmin} /></div>
                  <div><Label>OT after / day</Label><Input type="number" value={companyForm.overtime_daily_hours} onChange={(e) => setCompanyForm({ ...companyForm, overtime_daily_hours: e.target.value })} disabled={!isAdmin} /></div>
                  <div><Label>OT multiplier</Label><Input type="number" step="0.1" value={companyForm.overtime_multiplier} onChange={(e) => setCompanyForm({ ...companyForm, overtime_multiplier: e.target.value })} disabled={!isAdmin} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>PTO accrued / pay period</Label><Input type="number" step="0.25" value={companyForm.pto_accrual_hours_per_period} onChange={(e) => setCompanyForm({ ...companyForm, pto_accrual_hours_per_period: e.target.value })} disabled={!isAdmin} /></div>
                  <div><Label>PTO accrued / hour</Label><Input type="number" step="0.01" value={companyForm.pto_accrual_hours_per_hour} onChange={(e) => setCompanyForm({ ...companyForm, pto_accrual_hours_per_hour: e.target.value })} disabled={!isAdmin} /></div>
                  <div><Label>Punch rounding (min)</Label><Input type="number" min="0" step="1" value={companyForm.punch_rounding_minutes} onChange={(e) => setCompanyForm({ ...companyForm, punch_rounding_minutes: e.target.value })} disabled={!isAdmin} /></div>
                  <div><Label>Weekly labor budget</Label><Input type="number" min="0" step="50" value={companyForm.weekly_labor_budget} onChange={(e) => setCompanyForm({ ...companyForm, weekly_labor_budget: e.target.value })} disabled={!isAdmin} /></div>
                  <div><Label>Expiry reminder window (days)</Label><Input type="number" min="0" max="365" value={companyForm.expiry_reminder_days} onChange={(e) => setCompanyForm({ ...companyForm, expiry_reminder_days: e.target.value })} disabled={!isAdmin} /></div>
                </div>
                <div className="rounded-lg bg-[#f4f1e9] p-3 text-[11px] leading-relaxed text-muted">
                  Payroll uses these rules plus the rates in Pay rules. It does not file taxes or connect to a payment provider.
                </div>
                {isAdmin && <Button variant="outline" onClick={saveCompany} loading={saving}>Save payroll defaults</Button>}
              </div>
            </section>

            <section className="panel-raised p-5 xl:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted" />
                <p className="text-sm font-semibold">Kiosk mode</p>
              </div>
              <p className="text-xs text-muted">
                A PIN unlocks the shared time-clock tablet. It is a UI lock, not a security boundary; use a locked-down device and HTTPS.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="w-full max-w-xs">
                  <Label>Manager override PIN</Label>
                  <Input value={kioskPin} onChange={(e) => setKioskPin(e.target.value)} placeholder="4–12 characters" maxLength={12} />
                </div>
                <Button variant="outline" onClick={saveKiosk} loading={kioskSaving}>
                  {kioskPin.trim() ? "Save PIN" : "Remove PIN"}
                </Button>
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <p className="text-sm font-semibold">Paired tablets</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Each tablet gets its own clock-only token. Pairing codes expire in 10 minutes.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="w-full max-w-xs">
                    <Label>Tablet name</Label>
                    <Input value={kioskDeviceName} onChange={(e) => setKioskDeviceName(e.target.value)} placeholder="Front desk tablet" />
                  </div>
                  <div className="w-full max-w-xs">
                    <Label>Location</Label>
                    <Select value={kioskDeviceLocation} onChange={(e) => setKioskDeviceLocation(e.target.value)}>
                      <option value="">Choose a location</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>{location.name}</option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="outline" onClick={pairKiosk} loading={kioskPairBusy}>Pair tablet</Button>
                </div>
                {kioskPairing && (
                  <div className="mt-3 rounded-xl border border-[#d9c8b4] bg-[#fbf6ec] p-4">
                    <p className="eyebrow">Pairing code for {kioskPairing.name}</p>
                    <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.25em]">{kioskPairing.code}</p>
                    <p className="mt-1 text-[11px] text-muted">Enter it at /kiosk on the tablet. Expires {new Date(kioskPairing.expires_at).toLocaleTimeString(company.locale || "en-US", { hour: "numeric", minute: "2-digit" })}.</p>
                  </div>
                )}
                <div className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {kioskDevices.map((device) => (
                    <div key={device.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-medium">{device.name}</p>
                        <p className="text-[10px] text-muted">
                          {device.location_name || "Location"} · {device.last_seen ? `last seen ${new Date(device.last_seen).toLocaleString(company.locale || "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "never paired"}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => void revokeDevice(device)}>Revoke</Button>
                    </div>
                  ))}
                  {kioskDevices.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted">No tablets paired yet.</p>}
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "locations" && (
          <EntityList
            title="Locations"
            description="Where people clock in and shifts happen."
            icon={<MapPin className="size-4" />}
            onAdd={() => setLocationModal("new")}
            rows={locations.map((l) => ({
              id: l.id,
              primary: l.name,
              secondary: l.address || "No address",
              meta: <Badge tone={l.active ? "success" : "neutral"}>{l.active ? "Active" : "Off"}</Badge>,
              onEdit: () => setLocationModal(l),
              onDelete: () => remove("locations", l.id, l.name),
            }))}
          />
        )}

        {tab === "departments" && (
          <EntityList
            title="Departments"
            description="Teams that own shifts and colors on the schedule."
            icon={<Tags className="size-4" />}
            onAdd={() => setDepartmentModal("new")}
            rows={departments.map((d) => ({
              id: d.id,
              primary: d.name,
              secondary: `${positions.filter((p) => p.department === d.id).length} positions`,
              meta: <span className="size-3 rounded-full" style={{ backgroundColor: d.color || "#C4552D" }} />,
              onEdit: () => setDepartmentModal(d),
              onDelete: () => remove("departments", d.id, d.name),
            }))}
          />
        )}

        {tab === "positions" && (
          <EntityList
            title="Positions"
            description="Job titles used for scheduling and default pay."
            icon={<Users className="size-4" />}
            onAdd={() => setPositionModal("new")}
            rows={positions.map((p) => ({
              id: p.id,
              primary: p.name,
              secondary: departments.find((d) => d.id === p.department)?.name || "No department",
              meta: <span className="font-mono text-xs">{money(p.default_rate)}/hr</span>,
              onEdit: () => setPositionModal(p),
              onDelete: () => remove("positions", p.id, p.name),
            }))}
          />
        )}

        {tab === "certifications" && (
          <EntityList
            title="Certifications"
            description="Skills and licenses required by positions."
            icon={<ShieldCheck className="size-4" />}
            onAdd={() => setCertificationModal("new")}
            rows={certifications.map((certification) => ({
              id: certification.id,
              primary: certification.name,
              secondary: certification.description || "No description",
              meta: <Badge tone={certification.active !== false ? "success" : "neutral"}>{certification.active !== false ? "Active" : "Off"}</Badge>,
              onEdit: () => setCertificationModal(certification),
              onDelete: () => remove("certifications", certification.id, certification.name),
            }))}
          />
        )}

        {tab === "pay" && (
          <EntityList
            title="Pay rules"
            description="Percentages and fixed amounts applied to every pay run."
            icon={<Wallet className="size-4" />}
            onAdd={() => setPayModal("new")}
            canEdit={isAdmin}
            rows={payRules.map((r) => ({
              id: r.id,
              primary: r.name,
              secondary: `${titleCase(r.type)} · ${r.calc.replaceAll("_", " ")} · ${r.employer ? "employer" : "employee"}`,
              meta: <span className="font-mono text-xs">{r.calc === "percent" ? `${r.rate}%` : money(r.rate)}</span>,
              onEdit: () => setPayModal(r),
              onDelete: () => remove("pay_rules", r.id, r.name),
            }))}
          />
        )}

        {tab === "holidays" && (
          <EntityList
            title="Holidays"
            description="Paid dates to keep in mind while scheduling."
            icon={<CalendarDays className="size-4" />}
            onAdd={() => setHolidayModal("new")}
            rows={holidays.map((h) => ({
              id: h.id,
              primary: h.name,
              secondary: formatDate(h.date, "UTC"),
              meta: <Badge tone={h.paid ? "success" : "neutral"}>{h.paid ? "Paid" : "Unpaid"}</Badge>,
              onEdit: () => setHolidayModal(h),
              onDelete: () => remove("holidays", h.id, h.name),
            }))}
          />
        )}

        {tab === "access" && isAdmin && (
          <section className="panel-raised overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">Team access</p>
              <p className="mt-0.5 text-xs text-muted">Roles decide who can schedule, approve and run payroll.</p>
            </div>
            <div className="divide-y divide-line">
              {users.map((member) => (
                <div key={member.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-xs font-semibold">{member.name || member.email}</p>
                    <p className="text-[10px] text-muted">{member.email}</p>
                  </div>
                  <Badge tone={member.role === "admin" ? "dark" : member.role === "manager" ? "sage" : "neutral"}>{roleLabel(member.role)}</Badge>
                  <Select value={member.role} onChange={(e) => changeRole(member, e.target.value)} className="h-8 w-40 text-xs" disabled={member.id === user?.id}>
                    <option value="employee">Team member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </Select>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "activity" && isAdmin && (
          <section className="panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Activity log</p>
                <p className="mt-0.5 text-xs text-muted">Shifts, people and payroll changes.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("audit-log.csv", activity.map((row) => {
                    const record = row as { id: string; action?: string; collection?: string; summary?: string; at?: string; expand?: { actor?: User } };
                    return {
                      at: record.at || "",
                      actor: record.expand?.actor?.name || "System",
                      action: record.action || "",
                      collection: record.collection || "",
                      summary: record.summary || "",
                      record_id: record.id,
                    };
                  }))}
                  disabled={!activity.length}
                >
                  <Download className="size-3.5" /> Export CSV
                </Button>
                <Activity className="size-4 text-muted" />
              </div>
            </div>
            <div className="divide-y divide-line">
              {activity.map((row) => {
                const record = row as { id: string; action?: string; collection?: string; summary?: string; at?: string; expand?: { actor?: User } };
                return (
                  <div key={record.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="rounded-md bg-[#eeeae0] p-1.5 text-muted"><ShieldCheck className="size-3" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{record.summary || record.action}</p>
                      <p className="text-[10px] text-muted">
                        {record.expand?.actor?.name || "System"} · {record.collection || "—"}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted">{record.at ? toDate(record.at).toLocaleString(company.locale || "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
                  </div>
                );
              })}
              {activity.length === 0 && <p className="px-5 py-10 text-center text-xs text-muted">No activity recorded yet.</p>}
            </div>
          </section>
        )}
      </div>

      {locationModal && (
        <LocationModal
          record={locationModal === "new" ? null : locationModal}
          companyId={company.id}
          onClose={() => setLocationModal(null)}
          onSaved={load}
        />
      )}
      {departmentModal && (
        <DepartmentModal
          record={departmentModal === "new" ? null : departmentModal}
          companyId={company.id}
          onClose={() => setDepartmentModal(null)}
          onSaved={load}
        />
      )}
      {positionModal && (
        <PositionModal
          record={positionModal === "new" ? null : positionModal}
          companyId={company.id}
          departments={departments}
          certifications={certifications}
          onClose={() => setPositionModal(null)}
          onSaved={load}
        />
      )}
      {certificationModal && (
        <CertificationModal
          record={certificationModal === "new" ? null : certificationModal}
          companyId={company.id}
          onClose={() => setCertificationModal(null)}
          onSaved={load}
        />
      )}
      {payModal && (
        <PayRuleModal
          record={payModal === "new" ? null : payModal}
          companyId={company.id}
          onClose={() => setPayModal(null)}
          onSaved={load}
        />
      )}
      {holidayModal && (
        <HolidayModal
          record={holidayModal === "new" ? null : holidayModal}
          companyId={company.id}
          onClose={() => setHolidayModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function EntityList({
  title,
  description,
  icon,
  onAdd,
  rows,
  canEdit = true,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onAdd: () => void;
  canEdit?: boolean;
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    meta: React.ReactNode;
    onEdit: () => void;
    onDelete: () => void;
  }>;
}) {
  return (
    <section className="panel-raised overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={onAdd}><Plus className="size-3.5" /> Add</Button>
        ) : (
          <span className="text-[10px] text-muted">Admin only</span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-6"><EmptyState title={`No ${title.toLowerCase()} yet`} description={canEdit ? "Add the first one to get started." : "An administrator can add these."} action={canEdit ? <Button size="sm" onClick={onAdd}><Plus className="size-3.5" /> Add</Button> : undefined} /></div>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{row.primary}</p>
                <p className="truncate text-[10px] text-muted">{row.secondary}</p>
              </div>
              {row.meta}
              {canEdit && (
                <>
                  <button onClick={row.onEdit} className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-ink" title="Edit">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={row.onDelete} className="rounded-md p-1.5 text-muted hover:bg-[#f8ecea] hover:text-danger" title="Delete">
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LocationModal({ record, companyId, onClose, onSaved }: { record: Location | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: record?.name || "",
    address: record?.address || "",
    timezone: record?.timezone || "America/Los_Angeles",
    geofence_meters: String(record?.geofence_meters || 150),
    active: record?.active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const payload = { ...form, company: companyId, geofence_meters: Number(form.geofence_meters) || 0 };
      if (record) await pb.collection("locations").update(record.id, payload);
      else await pb.collection("locations").create(payload);
      toast(record ? "Location updated." : "Location added.");
      onSaved(); onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={record ? "Edit location" : "Add location"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Timezone</Label>
            <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "Asia/Singapore", "Australia/Sydney"].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </div>
          <div><Label>Geofence (m)</Label><Input type="number" value={form.geofence_meters} onChange={(e) => setForm({ ...form, geofence_meters: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <span className="text-sm">Active location</span>
        </div>
      </div>
    </Modal>
  );
}

function DepartmentModal({ record, companyId, onClose, onSaved }: { record: Department | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(record?.name || "");
  const [color, setColor] = useState(record?.color || "#C4552D");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (record) await pb.collection("departments").update(record.id, { name, color });
      else await pb.collection("departments").create({ name, color, company: companyId });
      toast(record ? "Department updated." : "Department added.");
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={record ? "Edit department" : "Add department"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" /></div>
      </div>
    </Modal>
  );
}

function PositionModal({ record, companyId, departments, certifications, onClose, onSaved }: { record: Position | null; companyId: string; departments: Department[]; certifications: Certification[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: record?.name || "", department: record?.department || "", default_rate: String(record?.default_rate || 18), required_certifications: record?.required_certifications || [] as string[] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const payload = { ...form, company: companyId, default_rate: Number(form.default_rate) || 0 };
      if (record) await pb.collection("positions").update(record.id, payload);
      else await pb.collection("positions").create(payload);
      toast(record ? "Position updated." : "Position added.");
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={record ? "Edit position" : "Add position"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Department</Label><Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
        <div><Label>Default hourly rate</Label><Input type="number" step="0.01" value={form.default_rate} onChange={(e) => setForm({ ...form, default_rate: e.target.value })} /></div>
        <div>
          <Label>Required certifications</Label>
          {certifications.length === 0 ? (
            <p className="text-xs text-muted">No certifications configured.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {certifications.map((certification) => (
                <label key={certification.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.required_certifications.includes(certification.id)}
                    onChange={(e) => setForm({
                      ...form,
                      required_certifications: e.target.checked
                        ? [...form.required_certifications, certification.id]
                        : form.required_certifications.filter((id) => id !== certification.id),
                    })}
                  />
                  {certification.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PayRuleModal({ record, companyId, onClose, onSaved }: { record: PayRule | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: record?.name || "",
    type: record?.type || "federal_tax",
    calc: record?.calc || "percent",
    rate: String(record?.rate || 0),
    employer: record?.employer ?? false,
    active: record?.active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const payload = { ...form, company: companyId, rate: Number(form.rate) || 0 };
      if (record) await pb.collection("pay_rules").update(record.id, payload);
      else await pb.collection("pay_rules").create(payload);
      toast(record ? "Pay rule updated." : "Pay rule added.");
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={record ? "Edit pay rule" : "Add pay rule"} description="Rates are applied on top of gross pay. This is not a tax engine." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Federal income tax" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Type</Label><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{["federal_tax", "state_tax", "social_security", "medicare", "health", "retirement", "garnishment", "other"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></div>
          <div><Label>Calculation</Label><Select value={form.calc} onChange={(e) => setForm({ ...form, calc: e.target.value as PayRule["calc"] })}><option value="percent">Percent of gross</option><option value="fixed_per_hour">Fixed per hour</option><option value="fixed_per_period">Fixed per period</option></Select></div>
        </div>
        <div><Label>{form.calc === "percent" ? "Rate (%)" : "Amount"}</Label><Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.checked })} /> Employer contribution</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        </div>
      </div>
    </Modal>
  );
}

function CertificationModal({ record, companyId, onClose, onSaved }: { record: Certification | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: record?.name || "", description: record?.description || "", active: record?.active !== false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const payload = { ...form, company: companyId };
      if (record) await pb.collection("certifications").update(record.id, payload);
      else await pb.collection("certifications").create(payload);
      toast(record ? "Certification updated." : "Certification added.");
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={record ? "Edit certification" : "Add certification"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Food handler" /></div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
      </div>
    </Modal>
  );
}

function HolidayModal({ record, companyId, onClose, onSaved }: { record: Holiday | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: record?.name || "", date: record?.date?.slice(0, 10) || "", paid: record?.paid ?? true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const payload = { ...form, company: companyId, date: `${form.date} 00:00:00.000Z` };
      if (record) await pb.collection("holidays").update(record.id, payload);
      else await pb.collection("holidays").create(payload);
      toast(record ? "Holiday updated." : "Holiday added.");
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={record ? "Edit holiday" : "Add holiday"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> Paid holiday</label>
      </div>
    </Modal>
  );
}
