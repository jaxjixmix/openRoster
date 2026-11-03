export type QueuedPunchType = "in" | "out" | "break_start" | "break_end";

export interface QueuedPunch {
  id: string;
  employee: string;
  type: QueuedPunchType;
  punched_at: string;
  offset_minutes: number;
  lat?: number;
  lng?: number;
}

const KEY = "openroster.offline-punches.v1";

function read(): QueuedPunch[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: QueuedPunch[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function getQueuedPunches(employee?: string): QueuedPunch[] {
  const items = read();
  return employee ? items.filter((item) => item.employee === employee) : items;
}

export function enqueuePunch(input: Omit<QueuedPunch, "id">): QueuedPunch {
  const item: QueuedPunch = {
    ...input,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
  write([...read(), item]);
  return item;
}

export function removeQueuedPunch(id: string) {
  write(read().filter((item) => item.id !== id));
}
