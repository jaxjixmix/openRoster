"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/data";
import type { Department, Employee, Location, Position, ShiftTemplate } from "@/lib/types";
import { fullName } from "@/lib/format";
import { Button, ErrorNote, Input, Label, Modal, Select, Textarea, Toggle } from "@/components/ui";
import { useToast } from "@/lib/toast";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function TemplateModal({
  open,
  onClose,
  template,
  locations,
  departments,
  positions,
  employees,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template?: ShiftTemplate | null;
  locations: Location[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  onSaved: () => void;
}) {
  const { company } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    location: "",
    department: "",
    position: "",
    employee: "",
    weekday: "1",
    start_time: "09:00",
    end_time: "17:00",
    break_minutes: "30",
    active: true,
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (template) {
      setForm({
        location: template.location || "",
        department: template.department || "",
        position: template.position || "",
        employee: template.employee || "",
        weekday: template.weekday || "1",
        start_time: template.start_time || "09:00",
        end_time: template.end_time || "17:00",
        break_minutes: String(template.break_minutes || 0),
        active: template.active !== false,
        notes: template.notes || "",
      });
    } else {
      setForm({
        location: locations[0]?.id || "",
        department: "",
        position: "",
        employee: "",
        weekday: "1",
        start_time: "09:00",
        end_time: "17:00",
        break_minutes: "30",
        active: true,
        notes: "",
      });
    }
  }, [open, template, locations]);

  const filteredPositions = useMemo(
    () => positions.filter((position) => !form.department || position.department === form.department),
    [positions, form.department],
  );
  const filteredEmployees = useMemo(
    () => employees.filter((employee) => employee.status === "active" && (!form.location || !employee.location || employee.location === form.location)),
    [employees, form.location],
  );

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!form.start_time || !form.end_time) throw new Error("Start and end times are required.");
      if (form.start_time === form.end_time) throw new Error("Start and end cannot be equal.");
      const payload = {
        company: company?.id,
        location: form.location || undefined,
        department: form.department || undefined,
        position: form.position || undefined,
        employee: form.employee || "",
        weekday: form.weekday,
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: Number(form.break_minutes) || 0,
        active: form.active,
        notes: form.notes || undefined,
      };
      if (template) await pb.collection("shift_templates").update(template.id, payload);
      else await pb.collection("shift_templates").create(payload);
      toast(template ? "Template updated." : "Template created.");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!template || !window.confirm("Delete this template? Existing shifts are not affected.")) return;
    setBusy(true);
    try {
      await pb.collection("shift_templates").delete(template.id);
      toast("Template deleted.", "info");
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
      title={template ? "Edit shift template" : "New shift template"}
      description="Apply templates to a week to generate draft shifts."
      width="lg"
      footer={<>
        {template && <Button variant="danger" onClick={remove} className="mr-auto"><Trash2 className="size-4" /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>{template ? "Save changes" : "Create template"}</Button>
      </>}
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Location</Label>
            <Select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
              <option value="">Any location</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value, position: "" })}>
              <option value="">Any department</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Position</Label>
            <Select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
              <option value="">Any position</option>
              {filteredPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Assigned to</Label>
            <Select value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}>
              <option value="">Open shift</option>
              {filteredEmployees.map((employee) => <option key={employee.id} value={employee.id}>{fullName(employee)}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label>Weekday</Label>
            <Select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
              {WEEKDAYS.map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
            </Select>
          </div>
          <div><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
          <div><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
          <div><Label>Break (min)</Label><Input type="number" min="0" step="5" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} /></div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
        <Toggle checked={form.active} onChange={(active) => setForm({ ...form, active })} label="Active" />
      </div>
    </Modal>
  );
}
