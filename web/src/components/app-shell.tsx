"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CircleUserRound,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Repeat,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { Avatar, Badge } from "@/components/ui";
import { CurrencyProvider } from "@/lib/currency";
import { NotificationBell } from "@/components/notification-bell";

const NAV = [
  { href: "/", label: "Today", icon: LayoutDashboard, manager: false },
  { href: "/schedule", label: "Schedule", icon: CalendarDays, manager: false },
  { href: "/timeclock", label: "Time Clock", icon: Clock3, manager: false },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardCheck, manager: false },
  { href: "/requests", label: "Time Off", icon: Inbox, manager: false },
  { href: "/calendar", label: "Time-off calendar", icon: CalendarClock, manager: false },
  { href: "/swaps", label: "Swaps", icon: Repeat, manager: false },
  { href: "/me", label: "My profile", icon: CircleUserRound, manager: false },
  { href: "/people", label: "People", icon: Users, manager: true },
  { href: "/templates", label: "Shift templates", icon: CalendarClock, manager: true },
  { href: "/payroll", label: "Payroll", icon: Wallet, manager: true },
  { href: "/reports", label: "Reports", icon: BarChart3, manager: true },
  { href: "/settings", label: "Settings", icon: Settings, manager: true },
];

function Logo() {
  return (
    <span className="grid size-8 shrink-0 grid-cols-2 gap-1 rounded-lg bg-[#f4f1e8] p-1.5">
      <span className="rounded-[2px] bg-accent" />
      <span className="rounded-[2px] bg-[#f4f1e8]/40" />
      <span className="rounded-[2px] bg-[#f4f1e8]/40" />
      <span className="rounded-[2px] bg-[#f4f1e8]" />
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, company, isManager, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-night text-[#f2efe5]">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <Logo />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">OpenRoster</p>
          <p className="truncate text-[11px] text-[#a7a18f]">{company?.name || "Workforce"}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell dark />
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#a7a18f]">
            {company?.currency || "USD"}
          </span>
        </div>
      </div>

      <div className="mx-5 mb-5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[#8e8878]">Workspace</p>
        <p className="mt-0.5 truncate text-xs text-[#cfc9b9]">
          {company?.timezone?.replace("_", " ") || "Local time"}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((item, index) => {
          if (item.manager && !isManager) return null;
          const prev = NAV[index - 1];
          const showSection = item.manager && (!prev || !prev.manager);
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <div key={item.href}>
              {showSection && (
                <p className="mb-2 mt-5 px-3 text-[10px] uppercase tracking-[0.16em] text-[#736e5f]">
                  Manage
                </p>
              )}
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition",
                  active
                    ? "bg-white/[0.09] text-white"
                    : "text-[#b9b3a3] hover:bg-white/[0.05] hover:text-[#f2efe5]",
                )}
              >
                {active && (
                  <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
                )}
                <Icon className={cn("size-4", active ? "text-accent" : "text-[#8e8878] group-hover:text-[#cfc9b9]")} />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user?.name} id={user?.id} size="sm" className="ring-2 ring-white/10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[#f2efe5]">{user?.name}</p>
            <p className="truncate text-[10px] text-[#8e8878]">{roleLabel(user?.role)}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-1.5 text-[#8e8878] transition hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, employee, company, isManager } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-paper">
      <aside className="print:hidden fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[280px] shadow-2xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1.5 text-[#a7a18f] hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="print:pl-0 lg:pl-[248px]">
        <header className="print:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/80 bg-paper/90 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-line bg-raised p-2"
          >
            <Menu className="size-4" />
          </button>
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-sm font-semibold">OpenRoster</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell />
            {!isManager && employee && <Badge tone="sage">Staff</Badge>}
            <Avatar name={user.name} id={user.id} size="sm" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="print:hidden mb-5 flex items-start gap-2.5 rounded-xl border border-[#e6d4ac] bg-[#fbf2dd] px-3.5 py-2.5 text-[11px] leading-relaxed text-[#82621c]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <p>
              <strong>Alpha.</strong> Not tax-compliant. Payroll here is a configurable preview, not
              withholding, filings or direct deposit. Do not use it to pay real people yet.
            </p>
          </div>
          <CurrencyProvider currency={company?.currency || "USD"} locale={company?.locale || "en-US"}>
            {children}
          </CurrencyProvider>
        </main>
      </div>
    </div>
  );
}
