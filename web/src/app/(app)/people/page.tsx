"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, UserCog, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getDepartments,
  getEmployees,
  getLocations,
  getPositions,
} from "@/lib/data";
import type { Department, Employee, Location, Position } from "@/lib/types";
import { employmentLabel, fullName, hours, money } from "@/lib/format";
import {
  Avatar,
  Badge,
  Button,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
} from "@/components/ui";
import { PersonModal } from "@/components/person-modal";

export default function PeoplePage() {
  const { isManager } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [emps, locs, depts, pos] = await Promise.all([
        getEmployees(),
        getLocations(),
        getDepartments(),
        getPositions(),
      ]);
      setEmployees(emps);
      setLocations(locs);
      setDepartments(depts);
      setPositions(pos);
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

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return employees.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (locationFilter && e.location !== locationFilter) return false;
      if (!q) return true;
      return [fullName(e), e.email, e.employee_number, e.expand?.position?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [employees, query, locationFilter, statusFilter]);

  const active = employees.filter((e) => e.status === "active");
  const fullTime = active.filter((e) => e.employment_type === "full_time");
  const hourly = active.filter((e) => e.pay_type === "hourly");

  if (!isManager) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Manager access required</p>
        <p className="mt-1 text-sm text-muted">Ask an administrator to upgrade your role.</p>
      </div>
    );
  }

  if (loading) return <Spinner label="Loading people…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Team"
        title="People"
        description="Profiles, pay, availability and everything that makes a roster work."
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="size-4" /> Add person
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active people" value={active.length} icon={<Users className="size-4" />} tone="sage" />
        <StatCard label="Full-time" value={fullTime.length} hint={`${active.length - fullTime.length} part-time or contractor`} tone="neutral" />
        <StatCard label="Hourly" value={hourly.length} hint={`${active.length - hourly.length} salaried`} tone="gold" />
        <StatCard
          label="Avg. hourly rate"
          value={money(hourly.length ? hourly.reduce((s, e) => s + (e.pay_rate || 0), 0) / hourly.length : 0)}
          hint="Active hourly staff"
          tone="accent"
        />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, position…"
            className="pl-9"
          />
        </div>
        <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="sm:w-44">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-36">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
          <option value="">All statuses</option>
        </Select>
      </div>

      <div className="panel-raised overflow-hidden">
        <div className="hidden grid-cols-[1.7fr_1fr_0.8fr_0.9fr_0.7fr_0.8fr] items-center gap-3 border-b border-line bg-[#f7f4ec] px-5 py-2.5 md:grid">
          <span className="table-head">Person</span>
          <span className="table-head">Position</span>
          <span className="table-head">Location</span>
          <span className="table-head">Type</span>
          <span className="table-head text-right">Pay</span>
          <span className="table-head text-right">PTO</span>
        </div>
        <div className="divide-y divide-line">
          {filtered.map((emp) => (
            <Link
              key={emp.id}
              href={`/people/${emp.id}`}
              className="grid grid-cols-2 items-center gap-3 px-5 py-3 transition hover:bg-black/[0.02] md:grid-cols-[1.7fr_1fr_0.8fr_0.9fr_0.7fr_0.8fr]"
            >
              <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                <Avatar name={fullName(emp)} id={emp.id} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fullName(emp)}</p>
                  <p className="truncate text-[11px] text-muted">{emp.email || emp.employee_number || "No email"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium">{emp.expand?.position?.name || "—"}</p>
                <p className="text-[10px] text-muted">{emp.expand?.department?.name || "Unassigned"}</p>
              </div>
              <p className="text-xs text-muted">{emp.expand?.location?.name || "—"}</p>
              <div>
                <p className="text-xs">{employmentLabel(emp.employment_type)}</p>
                <p className="text-[10px] capitalize text-muted">{emp.pay_type || "—"}</p>
              </div>
              <p className="text-right font-mono text-xs tabular">
                {emp.pay_type === "salary" ? money(emp.pay_rate) : money(emp.pay_rate) + "/hr"}
              </p>
              <div className="flex items-center justify-end gap-2">
                <span className="font-mono text-[11px] text-muted">{hours(emp.pto_balance_hours)}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setEditing(emp);
                    setModalOpen(true);
                  }}
                  className="rounded-md p-1 text-muted transition hover:bg-black/5 hover:text-ink"
                  title="Edit"
                >
                  <UserCog className="size-3.5" />
                </button>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium">No one matches</p>
              <p className="mt-1 text-xs text-muted">Try a different search or add a new person.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>{filtered.length} of {employees.length} people</span>
        <span className="flex items-center gap-1.5"><Badge tone="sage">Active</Badge> = schedulable</span>
      </div>

      <PersonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        employee={editing}
        locations={locations}
        departments={departments}
        positions={positions}
        onSaved={load}
      />
    </div>
  );
}
