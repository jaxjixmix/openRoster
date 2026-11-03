import type { Employee } from "./types";

export function money(value: number | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function compactMoney(value: number | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

export function hours(value: number | undefined): string {
  const n = Number(value || 0);
  return n % 1 === 0 ? `${n.toFixed(0)}h` : `${n.toFixed(2)}h`;
}

export function fullName(employee?: Partial<Employee> | null): string {
  if (!employee) return "Unknown";
  return `${employee.first_name || ""} ${employee.last_name || ""}`.trim();
}

export function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const AVATAR_TONES = [
  "bg-[#e8d5c9] text-[#7a3b23]",
  "bg-[#d7e4da] text-[#2f5c47]",
  "bg-[#e3dcef] text-[#5a437a]",
  "bg-[#f0e2bf] text-[#7a5a17]",
  "bg-[#d6e2ea] text-[#2f536b]",
  "bg-[#eed7d5] text-[#7a3230]",
];

export function avatarTone(id?: string): string {
  if (!id) return AVATAR_TONES[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function roleLabel(role?: string): string {
  if (role === "admin") return "Administrator";
  if (role === "manager") return "Manager";
  return "Team member";
}

export function employmentLabel(type?: string): string {
  if (type === "full_time") return "Full-time";
  if (type === "part_time") return "Part-time";
  if (type === "contractor") return "Contractor";
  return "—";
}

export function statusTone(
  status?: string,
): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (status === "approved" || status === "published" || status === "active" || status === "paid") return "success";
  if (status === "pending" || status === "draft" || status === "submitted" || status === "open") return "warning";
  if (status === "denied" || status === "inactive") return "danger";
  return "neutral";
}

export function titleCase(value?: string): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function percent(value?: number): string {
  return `${(Number(value) || 0).toFixed(1)}%`;
}
