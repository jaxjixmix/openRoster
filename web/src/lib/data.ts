import { pb } from "./pb";
import type {
  Availability,
  Employee,
  Holiday,
  Location,
  PayPeriod,
  PayRule,
  PtoEntry,
  PayRun,
  PayStub,
  Punch,
  Shift,
  TimeOffRequest,
  Timesheet,
  TimesheetEntry,
  DocumentRecord,
  Department,
  Position,
} from "./types";

export function pbDate(value: string): string {
  return value.includes("T") ? value.replace("T", " ") : value;
}

export const SHIFT_EXPAND = "employee,location,department,position";
export const EMPLOYEE_EXPAND = "user,location,department,position,manager";

export async function getShiftsBetween(
  startIso: string,
  endIso: string,
  opts: { employee?: string; location?: string } = {},
): Promise<Shift[]> {
  let filter = pb.filter("starts_at >= {:start} && starts_at < {:end}", {
    start: pbDate(startIso),
    end: pbDate(endIso),
  });
  if (opts.employee) {
    filter += " && " + pb.filter("employee = {:employee}", { employee: opts.employee });
  }
  if (opts.location) {
    filter += " && " + pb.filter("location = {:location}", { location: opts.location });
  }
  return pb.collection("shifts").getFullList<Shift>({
    filter,
    expand: SHIFT_EXPAND,
    sort: "starts_at",
  });
}

export async function getEmployees(): Promise<Employee[]> {
  return pb.collection("employees").getFullList<Employee>({
    expand: EMPLOYEE_EXPAND,
    sort: "first_name",
  });
}

export async function getEmployee(id: string): Promise<Employee> {
  return pb.collection("employees").getOne<Employee>(id, {
    expand: EMPLOYEE_EXPAND,
  });
}

export async function getPunchesBetween(
  employeeId: string | undefined,
  startIso: string,
  endIso: string,
): Promise<Punch[]> {
  let filter = pb.filter("punched_at >= {:start} && punched_at < {:end}", {
    start: pbDate(startIso),
    end: pbDate(endIso),
  });
  if (employeeId) {
    filter += " && " + pb.filter("employee = {:employee}", { employee: employeeId });
  }
  return pb.collection("punches").getFullList<Punch>({
    filter,
    expand: "employee,location",
    sort: "-punched_at",
  });
}

export async function getTimeOff(opts: {
  employee?: string;
  status?: string;
} = {}): Promise<TimeOffRequest[]> {
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  if (opts.employee) {
    conditions.push("employee = {:employee}");
    params.employee = opts.employee;
  }
  if (opts.status) {
    conditions.push("status = {:status}");
    params.status = opts.status;
  }
  return pb.collection("time_off_requests").getFullList<TimeOffRequest>({
    filter: conditions.length ? pb.filter(conditions.join(" && "), params) : "",
    expand: "employee",
    sort: "-start_date",
  });
}

export async function getTimesheets(opts: {
  employee?: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
} = {}): Promise<Timesheet[]> {
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  if (opts.employee) {
    conditions.push("employee = {:employee}");
    params.employee = opts.employee;
  }
  if (opts.periodStart) {
    conditions.push("period_start >= {:start}");
    params.start = pbDate(opts.periodStart);
  }
  if (opts.periodEnd) {
    conditions.push("period_end <= {:end}");
    params.end = pbDate(opts.periodEnd);
  }
  if (opts.status) {
    conditions.push("status = {:status}");
    params.status = opts.status;
  }
  return pb.collection("timesheets").getFullList<Timesheet>({
    filter: conditions.length ? pb.filter(conditions.join(" && "), params) : "",
    expand: "employee.position,employee.location,approved_by",
    sort: "-period_start",
  });
}

export async function getTimesheetEntries(timesheetId: string): Promise<TimesheetEntry[]> {
  return pb.collection("timesheet_entries").getFullList<TimesheetEntry>({
    filter: pb.filter("timesheet = {:timesheet}", { timesheet: timesheetId }),
    sort: "date",
  });
}

export async function getAvailability(employeeId: string): Promise<Availability[]> {
  return pb.collection("availability").getFullList<Availability>({
    filter: pb.filter("employee = {:employee}", { employee: employeeId }),
    sort: "weekday,start_time",
  });
}

export async function getPayPeriods(): Promise<PayPeriod[]> {
  return pb.collection("pay_periods").getFullList<PayPeriod>({
    sort: "-period_start",
  });
}

export async function getPayRuns(): Promise<PayRun[]> {
  return pb.collection("pay_runs").getFullList<PayRun>({
    sort: "-period_start",
  });
}

export async function getPayStubs(runId: string): Promise<PayStub[]> {
  return pb.collection("pay_stubs").getFullList<PayStub>({
    filter: pb.filter("pay_run = {:run}", { run: runId }),
    expand: "employee",
    sort: "created",
  });
}

export async function getPayRules(): Promise<PayRule[]> {
  return pb.collection("pay_rules").getFullList<PayRule>({ sort: "name" });
}

export async function getPtoEntries(employeeId: string): Promise<PtoEntry[]> {
  return pb.collection("pto_entries").getFullList<PtoEntry>({
    filter: pb.filter("employee = {:employee}", { employee: employeeId }),
    sort: "-date",
  });
}

export async function getHolidays(): Promise<Holiday[]> {
  return pb.collection("holidays").getFullList<Holiday>({ sort: "date" });
}

export async function getLocations(): Promise<Location[]> {
  return pb.collection("locations").getFullList<Location>({ sort: "name" });
}

export async function getDepartments(): Promise<Department[]> {
  return pb.collection("departments").getFullList<Department>({ sort: "name" });
}

export async function getPositions(): Promise<Position[]> {
  return pb.collection("positions").getFullList<Position>({ sort: "name" });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

export async function getDocuments(employeeId: string): Promise<DocumentRecord[]> {
  return pb.collection("documents").getFullList<DocumentRecord>({
    filter: pb.filter("employee = {:employee}", { employee: employeeId }),
    sort: "-created",
  });
}
