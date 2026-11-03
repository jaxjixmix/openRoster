#!/usr/bin/env node
/**
 * Retention cleanup. Dry-run by default; pass --apply to delete.
 *
 * Never touches payroll history (pay_runs, pay_stubs, timesheets, punches).
 * Deletes only notifications, audit logs and documents belonging to archived
 * employees outside the configured windows.
 */
const PB = process.env.PB_URL || "http://127.0.0.1:8097";
const EMAIL = process.env.PB_SUPERUSER || "admin@openroster.local";
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const APPLY = process.argv.includes("--apply");

const NOTIFICATION_DAYS = Number(process.env.RETENTION_NOTIFICATION_DAYS || 180);
const AUDIT_DAYS = Number(process.env.RETENTION_AUDIT_DAYS || 365);
const EMPLOYEE_DATA_DAYS = Number(process.env.RETENTION_EMPLOYEE_DATA_DAYS || 365);

if (!PASSWORD) {
  console.error("Set PB_SUPERUSER_PASSWORD.");
  process.exit(1);
}

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().replace("T", " ");
let token = "";

async function api(path, options = {}) {
  const res = await fetch(PB + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function all(collection, filter) {
  const rows = [];
  let page = 1;
  while (true) {
    const result = await api(`/api/collections/${collection}/records?perPage=200&page=${page}&filter=${encodeURIComponent(filter)}`);
    rows.push(...result.items);
    if (page >= result.totalPages) break;
    page++;
  }
  return rows;
}

async function purge(collection, filter, label) {
  const rows = await all(collection, filter);
  console.log(`${label}: ${rows.length}${APPLY ? "" : " (dry run)"}`);
  if (!APPLY) return rows.length;
  for (const row of rows) {
    await api(`/api/collections/${collection}/records/${row.id}`, { method: "DELETE" });
  }
  return rows.length;
}

async function main() {
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  token = auth.token;

  let deleted = 0;
  deleted += await purge("notifications", `created < "${daysAgo(NOTIFICATION_DAYS)}"`, `Notifications older than ${NOTIFICATION_DAYS} days`);
  deleted += await purge("audit_log", `at < "${daysAgo(AUDIT_DAYS)}"`, `Audit entries older than ${AUDIT_DAYS} days`);

  const archived = await all("employees", `status = "archived"`);
  for (const employee of archived) {
    deleted += await purge(
      "documents",
      `employee = "${employee.id}" && created < "${daysAgo(EMPLOYEE_DATA_DAYS)}"`,
      `Documents for archived ${employee.first_name} ${employee.last_name} older than ${EMPLOYEE_DATA_DAYS} days`,
    );
  }

  console.log(APPLY ? `Deleted ${deleted} records.` : `Would delete ${deleted} records. Re-run with --apply.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
