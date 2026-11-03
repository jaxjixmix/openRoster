"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import type { AppNotification } from "@/lib/types";
import { Button, EmptyState, Modal, Toggle } from "@/components/ui";
import { cn } from "@/lib/cn";

export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const { user, company } = useAuth();
  const router = useRouter();
  const tz = company?.timezone || "America/Los_Angeles";
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState({ in_app: true, email: false });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, unread] = await Promise.all([
        pb.collection("notifications").getList<AppNotification>(1, 30, {
          filter: pb.filter("user = {:user}", { user: user.id }),
          sort: "-created",
          requestKey: null,
        }),
        pb.collection("notifications").getList(1, 1, {
          filter: pb.filter("user = {:user} && read = false", { user: user.id }),
          requestKey: null,
        }),
      ]);
      setItems(rows.items);
      setUnreadTotal(unread.totalItems);
    } catch {}
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    pb.collection("notifications")
      .subscribe("*", (event) => {
        if (event.record.user === user.id) void load();
      })
      .then((fn) => { unsubscribe = fn; })
      .catch(() => {});
    return () => unsubscribe?.();
  }, [load, user]);

  useEffect(() => {
    if (!user) return;
    pb.collection("users").getOne(user.id).then((record) => {
      const stored = record.notification_prefs || {};
      setPrefs({ in_app: stored.in_app !== false, email: stored.email === true });
    }).catch(() => {});
  }, [user]);

  const unread = unreadTotal;

  async function markRead(item: AppNotification) {
    if (!item.read) {
      try {
        await pb.collection("notifications").update(item.id, { read: true });
        setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, read: true } : row));
        setUnreadTotal((count) => Math.max(0, count - 1));
      } catch {}
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  }

  async function markAll() {
    await pb.send("/api/openroster/notifications/read-all", { method: "POST" }).catch(() => {});
    await load();
  }

  async function savePrefs(next: { in_app: boolean; email: boolean }) {
    if (!user) return;
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await pb.collection("users").update(user.id, { notification_prefs: next });
    } finally {
      setSavingPrefs(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "relative rounded-lg p-2 transition",
          dark ? "text-[#a7a18f] hover:bg-white/10 hover:text-white" : "text-muted hover:bg-black/5 hover:text-ink",
        )}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[8px] font-semibold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        description="Schedule changes, time off and pay statements."
        footer={
          <>
            <Button variant="ghost" onClick={markAll} disabled={!unread}>
              <CheckCheck className="size-4" /> Mark all read
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </>
        }
      >
        <div className="space-y-4">
          {items.length === 0 ? (
            <EmptyState icon={<Bell className="size-5" />} title="No notifications" description="Schedule and time-off updates will appear here." />
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void markRead(item)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]",
                    !item.read && "bg-[#fbf6ec]",
                  )}
                >
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.read ? "bg-line-strong" : "bg-accent")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold">{item.title}</p>
                      <span className="shrink-0 text-[9px] text-muted">{formatDateTime(item.created, tz)}</span>
                    </div>
                    {item.body && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.body}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-line bg-[#f7f4ec] p-4">
            <p className="text-xs font-semibold">Preferences</p>
            <p className="mt-0.5 text-[10px] text-muted">Email requires PocketBase mail settings to be configured.</p>
            <div className="mt-3 flex flex-col gap-2">
              <Toggle checked={prefs.in_app} onChange={(value) => void savePrefs({ ...prefs, in_app: value })} label="In-app notifications" />
              <Toggle checked={prefs.email} onChange={(value) => void savePrefs({ ...prefs, email: value })} label="Email notifications" />
            </div>
            {savingPrefs && <p className="mt-2 text-[10px] text-muted">Saving…</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
