export type KioskPunchType = "in" | "out" | "break_start" | "break_end";

export interface KioskQueuedPunch {
  id: string;
  employee: string;
  employee_name: string;
  type: KioskPunchType;
  punched_at: string;
}

const KEY = "openroster.kiosk.queue.v1";

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

export function enqueueKioskPunch(input: Omit<KioskQueuedPunch, "id">): KioskQueuedPunch {
  const item: KioskQueuedPunch = {
    ...input,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
  write([...read(), item]);
  return item;
}

export function removeKioskPunch(id: string) {
  write(read().filter((item) => item.id !== id));
}
