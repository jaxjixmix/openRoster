"use client";

import Link from "next/link";
import { Clock, MapPin, UserRound } from "lucide-react";
import type { Shift } from "@/lib/types";
import { dateInTz, durationLabel, formatTime, toDate } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Avatar, Badge } from "@/components/ui";

const FALLBACK_COLORS = ["#C4552D", "#3F6B57", "#7B5C9E", "#A97B2F", "#3D6B8A"];

export function shiftColor(shift: Shift): string {
  if (shift.expand?.position) {
    const name = shift.expand.position.name;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
  }
  return shift.expand?.department?.color || FALLBACK_COLORS[0];
}

export function ShiftRow({
  shift,
  tz,
  showDate = false,
  href,
  compact = false,
}: {
  shift: Shift;
  tz: string;
  showDate?: boolean;
  href?: string;
  compact?: boolean;
}) {
  const { company } = useAuth();
  const locale = company?.locale || "en-US";
  const color = shiftColor(shift);
  const employee = shift.expand?.employee;
  const content = (
    <div className="flex items-center gap-3">
      <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {shift.expand?.position?.name || shift.expand?.department?.name || "Shift"}
          </p>
          {shift.status === "draft" && <Badge tone="warning">Draft</Badge>}
          {shift.source === "auto" && <Badge tone="neutral">Auto</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatTime(shift.starts_at, tz)} – {formatTime(shift.ends_at, tz)}
          </span>
          {!compact && shift.expand?.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {shift.expand.location.name}
            </span>
          )}
          {showDate && <span>{toDate(shift.starts_at).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", timeZone: tz })}</span>}
          <span className="text-muted/70">{durationLabel(shift.starts_at, shift.ends_at)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {employee ? (
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium">{fullName(employee)}</p>
              <p className="text-[10px] text-muted">{employee.expand?.position?.name || ""}</p>
            </div>
            <Avatar name={fullName(employee)} id={employee.id} size={compact ? "xs" : "sm"} />
          </div>
        ) : (
          <Badge tone="accent" className="gap-1">
            <UserRound className="size-2.5" /> Open
          </Badge>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-xl border border-line bg-raised px-3 py-2.5 transition hover:border-line-strong hover:shadow-sm">
        {content}
      </Link>
    );
  }
  return <div className="rounded-xl border border-line bg-raised px-3 py-2.5">{content}</div>;
}

export function shiftDateInTz(shift: Shift, tz: string): string {
  return dateInTz(shift.starts_at, tz);
}
