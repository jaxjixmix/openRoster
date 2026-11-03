"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/data";
import type { Department, Employee, Location, Position, Shift } from "@/lib/types";
import { dateInTz, timeInTz, toDate, toUtcIso } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { Button, ErrorNote, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/lib/toast";

interface Props {
  open: boolean;
  onClose: () => void;
  shift?: Shift | null;
  defaultDate?: string;
  tz: string;
  canEdit: boolean;
  employees: Employee[];
  locations: Location[];
  departments: Department[];
  positions: Position[];
  onSaved: () => void;
}

export function ShiftModal({
  open,
  onClose,
  shift,
  defaultDate,
  tz,
  canEdit,
  employees,
  locations,
  departments,
  positions,
  onSaved,
}: Props) {
  const toast = useToast();
  const { company } = useAuth();
  const [location, setLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [employee, setEmployee] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [status, setStatus] = useState("published");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (shift) {
      setLocation(shift.location || "");
      setDepartment(shift.department || "");
      setPosition(shift.position || "");
      setEmployee(shift.employee || "");
      setDate(dateInTz(shift.starts_at, tz));
      setStartTime(timeInTz(shift.starts_at, tz));
      setEndTime(timeInTz(shift.ends_at, tz));
      setBreakMinutes(String(shift.break_minutes || 0));
      setStatus(shift.status || "published");
      setNotes(shift.notes || "");
    } else {
      setLocation(locations[0]?.id || "");
      setDepartment("");
      setPosition("");
      setEmployee("");
      setDate(defaultDate || "");
      setStartTime("09:00");
      setEndTime("17:00");
      setBreakMinutes("30");
      setStatus("published");
      setNotes("");
    }
    setError("");
  }, [open, shift, defaultDate, tz, locations]);

  const filteredPositions = useMemo(
    () => positions.filter((p) => !department || p.department === department),
    [positions, department],
  );
  const filteredEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.status === "active" &&
          (!location || !e.location || e.location === location) &&
          (!department || !e.department || e.department === department),
      ),
    [employees, location, department],
  );

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!date || !startTime || !endTime) throw new Error("Date, start and end are required.");
      const starts = toUtcIso(date, startTime, tz);
      const ends = toUtcIso(date, endTime, tz);
      if (+toDate(ends) <= +toDate(starts)) throw new Error("End time must be after start time.");
      const payload: Record<string, unknown> = {
        company: company?.id,
        location: location || undefined,
        department: department || undefined,
        position: position || undefined,
        employee: employee || "",
        local_date: `${date} 00:00:00.000Z`,
        local_start: startTime,
        local_end: endTime,
        starts_at: starts,
        ends_at: ends,
        break_minutes: Number(breakMinutes) || 0,
        status,
        notes: notes || undefined,
      };
      if (shift) {
        await pb.collection("shifts").update(shift.id, payload);
        toast("Shift updated.");
      } else {
        await pb.collection("shifts").create({ ...payload, source: "manual" });
        toast("Shift added.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!shift) return;
    if (!window.confirm("Delete this shift? This cannot be undone.")) return;
    setBusy(true);
    try {
      await pb.collection("shifts").delete(shift.id);
      toast("Shift deleted.");
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
      title={shift ? (canEdit ? "Edit shift" : "Shift details") : "Add shift"}
      description={
        shift
          ? `${dateInTz(shift.starts_at, tz)} · ${shift.expand?.location?.name || "Location"}`
          : "Create a shift and assign it, or leave it open for the team."
      }
      footer={
        canEdit ? (
          <>
            {shift && (
              <Button variant="danger" onClick={remove} disabled={busy} className="mr-auto">
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={busy}>{shift ? "Save changes" : "Add shift"}</Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {canEdit ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Location</Label>
                <Select value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="">Any location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPosition(""); }}>
                  <option value="">Any department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Position</Label>
                <Select value={position} onChange={(e) => setPosition(e.target.value)}>
                  <option value="">Any position</option>
                  {filteredPositions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Assigned to</Label>
                <Select value={employee} onChange={(e) => setEmployee(e.target.value)}>
                  <option value="">Open shift</option>
                  {filteredEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {fullName(emp)}{emp.expand?.position ? ` · ${emp.expand.position.name}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Unpaid break (min)</Label>
                <Input type="number" min="0" step="5" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <p className="text-[11px] leading-snug text-muted">
                  {employee ? "The assigned person will see this on their schedule." : "Open shifts can be filled by auto-fill or manually."}
                </p>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Setup, cover, uniform, anything the team should know." rows={3} />
            </div>
          </>
        ) : (
          shift && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#f2eee3] p-4">
                <p className="eyebrow">When</p>
                <p className="mt-1 text-sm font-medium">
                  {toDate(shift.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })}
                </p>
                <p className="text-sm text-muted">
                  {timeInTz(shift.starts_at, tz)} – {timeInTz(shift.ends_at, tz)} · break {shift.break_minutes || 0} min
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="eyebrow">Location</p>
                  <p className="mt-1 text-sm">{shift.expand?.location?.name || "—"}</p>
                </div>
                <div>
                  <p className="eyebrow">Position</p>
                  <p className="mt-1 text-sm">{shift.expand?.position?.name || shift.expand?.department?.name || "—"}</p>
                </div>
                <div>
                  <p className="eyebrow">Assigned to</p>
                  <p className="mt-1 text-sm">{shift.expand?.employee ? fullName(shift.expand.employee) : "Open shift"}</p>
                </div>
                <div>
                  <p className="eyebrow">Status</p>
                  <p className="mt-1 text-sm capitalize">{shift.status}</p>
                </div>
              </div>
              {shift.notes && (
                <div>
                  <p className="eyebrow">Notes</p>
                  <p className="mt-1 text-sm text-muted">{shift.notes}</p>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
