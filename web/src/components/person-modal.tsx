"use client";

import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/data";
import type { Department, Employee, Location, Position } from "@/lib/types";
import { Button, ErrorNote, Input, Label, Modal, Select, Textarea, Toggle } from "@/components/ui";
import { useToast } from "@/lib/toast";

interface Props {
  open: boolean;
  onClose: () => void;
  employee?: Employee | null;
  locations: Location[];
  departments: Department[];
  positions: Position[];
  onSaved: () => void;
}

const EMPTY = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  location: "",
  department: "",
  position: "",
  employment_type: "full_time",
  pay_type: "hourly",
  pay_rate: "18",
  max_weekly_hours: "40",
  pto_balance_hours: "0",
  hire_date: new Date().toISOString().slice(0, 10),
  employee_number: "",
  notes: "",
  status: "active",
  create_login: true,
  password: "OpenRoster123!",
};

export function PersonModal({ open, onClose, employee, locations, departments, positions, onSaved }: Props) {
  const { user, company } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!open) return;
    setError("");
    if (employee) {
      setForm({
        first_name: employee.first_name || "",
        last_name: employee.last_name || "",
        email: employee.email || "",
        phone: employee.phone || "",
        location: employee.location || "",
        department: employee.department || "",
        position: employee.position || "",
        employment_type: employee.employment_type || "full_time",
        pay_type: employee.pay_type || "hourly",
        pay_rate: String(employee.pay_rate || ""),
        max_weekly_hours: String(employee.max_weekly_hours || 40),
        pto_balance_hours: String(employee.pto_balance_hours || 0),
        hire_date: employee.hire_date ? employee.hire_date.slice(0, 10) : "",
        employee_number: employee.employee_number || "",
        notes: employee.notes || "",
        status: employee.status || "active",
        create_login: false,
        password: "",
      });
    } else {
      setForm({ ...EMPTY, location: locations[0]?.id || "" });
    }
  }, [open, employee, locations]);

  const filteredPositions = useMemo(
    () => positions.filter((p) => !form.department || p.department === form.department),
    [positions, form.department],
  );

  function update<K extends keyof typeof form>(key: K, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!form.first_name.trim() || !form.last_name.trim()) throw new Error("First and last name are required.");
      const wantsLogin = !!form.create_login && isAdmin;
      if (!employee && wantsLogin && !form.email.trim()) throw new Error("Email is required to create a login.");

      let userId: string | undefined = employee?.user || undefined;
      if (!employee && wantsLogin) {
        const created = await pb.collection("users").create({
          email: form.email.trim(),
          password: form.password,
          passwordConfirm: form.password,
          name: `${form.first_name} ${form.last_name}`.trim(),
          role: "employee",
          phone: form.phone || undefined,
        });
        userId = created.id;
      }

      const payload: Record<string, unknown> = {
        company: company?.id,
        user: userId || "",
        location: form.location || undefined,
        department: form.department || undefined,
        position: form.position || undefined,
        employee_number: form.employee_number || undefined,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone || undefined,
        hire_date: form.hire_date ? `${form.hire_date} 00:00:00.000Z` : undefined,
        employment_type: form.employment_type,
        pay_type: form.pay_type,
        pay_rate: Number(form.pay_rate) || 0,
        overtime_exempt: form.pay_type === "salary",
        max_weekly_hours: Number(form.max_weekly_hours) || 40,
        pto_balance_hours: Number(form.pto_balance_hours) || 0,
        status: form.status,
        notes: form.notes || undefined,
      };

      if (employee) {
        await pb.collection("employees").update(employee.id, payload);
        toast("Team member updated.");
      } else {
        await pb.collection("employees").create(payload);
        toast("Team member added.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? "Edit team member" : "Add team member"}
      description={employee ? "Update role, pay and placement." : "Create a profile. Logins are optional."}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{employee ? "Save changes" : "Add person"}</Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>First name</Label>
            <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} placeholder="Sam" />
          </div>
          <div>
            <Label>Last name</Label>
            <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} placeholder="Rivera" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="sam@company.com" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(415) 555-0100" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Location</Label>
            <Select value={form.location} onChange={(e) => update("location", e.target.value)}>
              <option value="">Unassigned</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onChange={(e) => { update("department", e.target.value); update("position", ""); }}>
              <option value="">Unassigned</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Position</Label>
            <Select value={form.position} onChange={(e) => update("position", e.target.value)}>
              <option value="">Unassigned</option>
              {filteredPositions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Employment</Label>
            <Select value={form.employment_type} onChange={(e) => update("employment_type", e.target.value)}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contractor">Contractor</option>
            </Select>
          </div>
          <div>
            <Label>Pay type</Label>
            <Select value={form.pay_type} onChange={(e) => update("pay_type", e.target.value)}>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </Select>
          </div>
          <div>
            <Label>{form.pay_type === "salary" ? "Annual salary" : "Hourly rate"}</Label>
            <Input type="number" min="0" step="0.01" value={form.pay_rate} onChange={(e) => update("pay_rate", e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Max weekly hours</Label>
            <Input type="number" min="0" step="1" value={form.max_weekly_hours} onChange={(e) => update("max_weekly_hours", e.target.value)} />
          </div>
          <div>
            <Label>PTO balance (hours)</Label>
            <Input type="number" min="0" step="0.5" value={form.pto_balance_hours} onChange={(e) => update("pto_balance_hours", e.target.value)} />
          </div>
          <div>
            <Label>Hire date</Label>
            <Input type="date" value={form.hire_date} onChange={(e) => update("hire_date", e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Employee number</Label>
            <Input value={form.employee_number} onChange={(e) => update("employee_number", e.target.value)} placeholder="HH-113" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => update("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} placeholder="Certifications, accommodations, anything worth keeping." />
        </div>

        {!employee && (
          <div className="rounded-xl border border-line bg-[#f4f1e9] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Create a login</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {isAdmin ? "They can clock in and see their schedule." : "Only an administrator can create logins."}
                </p>
              </div>
              <Toggle
                checked={form.create_login && isAdmin}
                onChange={(v) => update("create_login", v)}
                label=""
              />
            </div>
            {form.create_login && isAdmin && (
              <div className="mt-3">
                <Label>Temporary password</Label>
                <Input value={form.password} onChange={(e) => update("password", e.target.value)} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
