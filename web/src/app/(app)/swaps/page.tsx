"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Repeat, X } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { errorMessage, getSwaps } from "@/lib/data";
import type { ShiftSwap } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { Badge, Button, EmptyState, PageHeader, Spinner, Tabs } from "@/components/ui";
import { useToast } from "@/lib/toast";

type Tab = "open" | "mine" | "history" | "all";

export default function SwapsPage() {
  const { employee, isManager } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<ShiftSwap[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("open");

  const load = useCallback(async () => {
    try {
      setItems(await getSwaps());
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "open") {
      return items.filter((swap) => swap.status === "open" && swap.offered_by?.id !== employee?.id);
    }
    if (tab === "mine") {
      return items.filter((swap) => swap.offered_by?.id === employee?.id || swap.accepted_by?.id === employee?.id);
    }
    if (tab === "history") {
      return items.filter((swap) => ["approved", "denied", "cancelled"].includes(swap.status));
    }
    return items;
  }, [items, tab, employee?.id]);

  async function accept(swap: ShiftSwap) {
    try {
      await pb.send("/api/openroster/swaps/accept", { method: "POST", body: { swap: swap.id } });
      await load();
      toast("Swap accepted. A manager still needs to approve it.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function decide(swap: ShiftSwap, status: "approved" | "denied" | "cancelled") {
    try {
      await pb.send("/api/openroster/swaps/status", { method: "POST", body: { swap: swap.id, status } });
      await load();
      toast(`Swap ${status}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (loading) return <Spinner label="Loading swaps…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Scheduling"
        title="Shift swaps"
        description="Offer a shift, pick up a colleague's shift, or approve a swap as a manager."
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "open", label: "Open", count: items.filter((s) => s.status === "open" && s.offered_by?.id !== employee?.id).length },
          { value: "mine", label: "Mine", count: items.filter((s) => s.offered_by?.id === employee?.id || s.accepted_by?.id === employee?.id).length },
          { value: "history", label: "History", count: items.filter((s) => ["approved", "denied", "cancelled"].includes(s.status)).length },
          ...(isManager ? [{ value: "all" as Tab, label: "All", count: items.length }] : []),
        ]}
      />

      <div className="mt-4 panel-raised overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Repeat className="size-5" />}
              title={tab === "open" ? "No open swaps" : "Nothing here"}
              description={tab === "open" ? "Open a shift from your schedule to offer it." : "Swaps will appear here."}
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((swap) => (
              <div key={swap.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <span className="rounded-lg bg-[#eeeae0] p-2 text-muted">
                  <ArrowLeftRight className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">
                      {swap.shift.position || "Shift"} · {formatDate(swap.shift.local_date || swap.shift.starts_at, "UTC")}
                    </p>
                    <Badge tone={swap.status === "approved" ? "success" : swap.status === "open" ? "warning" : swap.status === "accepted" ? "accent" : "neutral"}>
                      {swap.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {swap.shift.local_start || ""}–{swap.shift.local_end || ""} · {swap.shift.location || "Location"}
                    {swap.offered_by ? ` · offered by ${swap.offered_by.name}` : ""}
                    {swap.accepted_by ? ` · accepted by ${swap.accepted_by.name}` : ""}
                  </p>
                  {swap.note && <p className="mt-1 text-[11px] text-muted">{swap.note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {swap.status === "open" && swap.offered_by?.id !== employee?.id && (
                    <Button size="sm" onClick={() => accept(swap)}><Check className="size-3.5" /> Accept</Button>
                  )}
                  {isManager && swap.status === "accepted" && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => decide(swap, "denied")}><X className="size-3.5" /> Deny</Button>
                      <Button size="sm" onClick={() => decide(swap, "approved")}><Check className="size-3.5" /> Approve</Button>
                    </>
                  )}
                  {swap.status !== "approved" && swap.status !== "denied" && swap.status !== "cancelled" &&
                    (isManager || swap.offered_by?.id === employee?.id) && (
                      <Button variant="ghost" size="sm" onClick={() => decide(swap, "cancelled")}>Cancel</Button>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
