"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getDepartments,
  getEmployees,
  getLocations,
  getPositions,
  getShiftTemplates,
} from "@/lib/data";
import type { Department, Employee, Location, Position, ShiftTemplate } from "@/lib/types";
import { fullName } from "@/lib/format";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { TemplateModal } from "@/components/template-modal";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TemplatesPage() {
  const { isManager } = useAuth();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [rows, locs, depts, pos, emps] = await Promise.all([
        getShiftTemplates(),
        getLocations(),
        getDepartments(),
        getPositions(),
        getEmployees(),
      ]);
      setTemplates(rows);
      setLocations(locs);
      setDepartments(depts);
      setPositions(pos);
      setEmployees(emps);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isManager) {
    return <div className="panel p-8 text-center"><p className="text-sm font-semibold">Manager access required</p></div>;
  }
  if (loading) return <Spinner label="Loading shift templates…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Scheduling"
        title="Shift templates"
        description="Recurring weekly shifts. Apply them from the Schedule to generate drafts."
        actions={<Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="size-4" /> New template</Button>}
      />

      {error && <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">{error}</div>}

      <div className="panel-raised overflow-hidden">
        {templates.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<CalendarClock className="size-5" />}
              title="No templates yet"
              description="Create a weekly pattern, then apply it to an empty week from Schedule."
              action={<Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="size-3.5" /> New template</Button>}
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => { setEditing(template); setModalOpen(true); }}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-black/[0.02]"
              >
                <span className="rounded-lg bg-[#eeeae0] p-2 text-muted"><CalendarClock className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{WEEKDAYS[Number(template.weekday)] || "Day"} · {template.start_time}–{template.end_time}</p>
                    <Badge tone={template.active !== false ? "success" : "neutral"}>{template.active !== false ? "Active" : "Off"}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {template.expand?.position?.name || "Any position"} · {template.expand?.location?.name || "Any location"}
                    {template.expand?.employee ? ` · ${fullName(template.expand.employee)}` : " · Open shift"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <TemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        template={editing}
        locations={locations}
        departments={departments}
        positions={positions}
        employees={employees}
        onSaved={load}
      />
    </div>
  );
}
