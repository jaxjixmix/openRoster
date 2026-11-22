export type KioskPunchType = "in" | "out" | "break_start" | "break_end";

export interface KioskQueuedPunch {
  id: string;
  employee: string;
  employee_name: string;
  type: KioskPunchType;
  punched_at: string;
  /** The PIN typed at the tablet. The server verifies it when the queue syncs, then we drop it. */
  pin: string;
}

const KEY = "openroster.kiosk.queue.v1";
const REJECTED_KEY = "openroster.kiosk.rejected.v1";
/** A tablet stuck offline should stop accepting punches before it becomes a forgery backlog. */
export const MAX_KIOSK_QUEUE = 50;

function read(): KioskQueuedPunch[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: KioskQueuedPunch[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function getKioskQueue(): KioskQueuedPunch[] {
  return read();
}

export function enqueueKioskPunch(input: Omit<KioskQueuedPunch, "id">): KioskQueuedPunch | null {
  const pending = read();
  if (pending.length >= MAX_KIOSK_QUEUE) return null;
  const item: KioskQueuedPunch = {
    ...input,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
  write([...pending, item]);
  return item;
}

// Punches the server refused (wrong PIN, no PIN on file): kept as a count for the banner so
// the tablet does not silently swallow them, and so a manager can be asked to look.
export function getKioskRejected(): number {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(REJECTED_KEY) || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function addKioskRejected(count = 1) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REJECTED_KEY, String(getKioskRejected() + count));
}

export function clearKioskRejected() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REJECTED_KEY);
}

export function removeKioskPunch(id: string) {
  write(read().filter((item) => item.id !== id));
}
