export interface BaseRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  expand?: Record<string, unknown>;
}

export interface User extends BaseRecord {
  email: string;
  name: string;
  role: "admin" | "manager" | "employee";
  phone?: string;
  avatar?: string;
  verified?: boolean;
  notification_prefs?: { in_app?: boolean; email?: boolean };
}

export interface Company extends BaseRecord {
  name: string;
  legal_name?: string;
  timezone: string;
  currency: string;
  locale?: string;
  week_start: string;
  pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  overtime_weekly_hours: number;
  overtime_daily_hours: number;
  overtime_multiplier: number;
  punch_rounding_minutes?: number;
  weekly_labor_budget?: number;
  expiry_reminder_days?: number;
  pto_accrual_hours_per_period?: number;
  pto_accrual_hours_per_hour?: number;
  address?: string;
  phone?: string;
  logo?: string;
  setup_complete?: boolean;
}

export interface Location extends BaseRecord {
  company: string;
  name: string;
  address?: string;
  timezone?: string;
  lat?: number;
  lng?: number;
  geofence_meters?: number;
  active?: boolean;
}

export interface Department extends BaseRecord {
  company: string;
  name: string;
  color?: string;
}

export interface Position extends BaseRecord {
  company: string;
  department?: string;
  name: string;
  default_rate?: number;
  active?: boolean;
  required_certifications?: string[];
}

export interface Certification extends BaseRecord {
  company: string;
  name: string;
  description?: string;
  active?: boolean;
}

export interface EmployeeCertification extends BaseRecord {
  company: string;
  employee: string;
  certification: string;
  issued_at?: string;
  expires_at?: string;
  note?: string;
  expand?: { certification?: Certification };
}

export interface Employee extends BaseRecord {
  user?: string;
  company: string;
  location?: string;
  department?: string;
  position?: string;
  manager?: string;
  employee_number?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  hire_date?: string;
  termination_date?: string;
  employment_type?: "full_time" | "part_time" | "contractor";
  pay_type?: "hourly" | "salary";
  pay_rate?: number;
  overtime_exempt?: boolean;
  max_weekly_hours?: number;
  pto_balance_hours?: number;
  status?: "active" | "inactive" | "archived";
  archived_at?: string;
  notes?: string;
  expand?: {
    user?: User;
    location?: Location;
    department?: Department;
    position?: Position;
    manager?: Employee;
  };
}

export interface ShiftTemplate extends BaseRecord {
  company: string;
  location?: string;
  department?: string;
  position?: string;
  employee?: string;
  weekday: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  active?: boolean;
  notes?: string;
  expand?: {
    location?: Location;
    department?: Department;
    position?: Position;
    employee?: Employee;
  };
}

export interface Shift extends BaseRecord {
  company: string;
  location?: string;
  department?: string;
  position?: string;
  employee?: string;
  starts_at: string;
  ends_at: string;
  local_date?: string;
  local_start?: string;
  local_end?: string;
  template?: string;
  break_minutes?: number;
  status: "draft" | "published";
  source?: "manual" | "auto" | "swap";
  notes?: string;
  created_by?: string;
  expand?: {
    employee?: Employee;
    location?: Location;
    department?: Department;
    position?: Position;
  };
}

export interface Punch extends BaseRecord {
  employee: string;
  location?: string;
  type: "in" | "out" | "break_start" | "break_end";
  punched_at: string;
  source?: string;
  client_id?: string;
  queued?: boolean;
  lat?: number;
  lng?: number;
  note?: string;
  expand?: { employee?: Employee; location?: Location };
}

export interface Availability extends BaseRecord {
  employee: string;
  weekday: string;
  start_time: string;
  end_time: string;
  effective_from?: string;
  effective_to?: string;
  notes?: string;
}

export interface TimeOffRequest extends BaseRecord {
  employee: string;
  type: "vacation" | "sick" | "unpaid" | "other";
  start_date: string;
  end_date: string;
  hours?: number;
  status: "pending" | "approved" | "denied";
  approved_by?: string;
  note?: string;
  expand?: { employee?: Employee };
}

export interface TimesheetEntry extends BaseRecord {
  timesheet: string;
  employee: string;
  date: string;
  shift?: string;
  regular_hours?: number;
  overtime_hours?: number;
  pto_hours?: number;
  note?: string;
}

export interface Timesheet extends BaseRecord {
  employee: string;
  period_start: string;
  period_end: string;
  regular_hours?: number;
  overtime_hours?: number;
  pto_hours?: number;
  total_hours?: number;
  status: "open" | "submitted" | "approved" | "paid";
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  expand?: { employee?: Employee; approved_by?: User };
}

export interface PayRule extends BaseRecord {
  company: string;
  name: string;
  type: string;
  calc: "percent" | "fixed_per_hour" | "fixed_per_period";
  rate: number;
  applies_to?: string;
  employer?: boolean;
  active?: boolean;
}

export interface BlackoutDate extends BaseRecord {
  company: string;
  name: string;
  start_date: string;
  end_date: string;
  note?: string;
  active?: boolean;
}

export interface KioskPin extends BaseRecord {
  company: string;
  pin: string;
  enabled?: boolean;
}

export interface PayPeriod extends BaseRecord {
  company: string;
  period_start: string;
  period_end: string;
  pay_date?: string;
  status: "open" | "closed";
  locked_at?: string;
  created_by?: string;
}

export interface PayRun extends BaseRecord {
  company: string;
  period_start: string;
  period_end: string;
  pay_date?: string;
  status: "draft" | "approved" | "paid" | "voided";
  voided_at?: string;
  void_reason?: string;
  total_gross?: number;
  total_tax?: number;
  total_deductions?: number;
  total_net?: number;
  notes?: string;
  created_by?: string;
}

export interface PayStub extends BaseRecord {
  pay_run: string;
  employee: string;
  regular_hours?: number;
  overtime_hours?: number;
  pto_hours?: number;
  regular_pay?: number;
  overtime_pay?: number;
  pto_pay?: number;
  gross_pay?: number;
  employee_taxes?: number;
  employee_deductions?: number;
  employer_taxes?: number;
  net_pay?: number;
  breakdown?: PayLine[];
  expand?: { employee?: Employee; pay_run?: PayRun };
}

export interface PayLine {
  name: string;
  type: string;
  calc: string;
  rate: number;
  amount: number;
  employer: boolean;
}

export interface PtoEntry extends BaseRecord {
  company: string;
  employee: string;
  date: string;
  type: "accrual" | "usage" | "adjustment" | "carryover";
  hours: number;
  note?: string;
  time_off_request?: string;
  period_start?: string;
  created_by?: string;
  expand?: { employee?: Employee };
}

export interface Holiday extends BaseRecord {
  company: string;
  name: string;
  date: string;
  paid?: boolean;
}

export interface DocumentRecord extends BaseRecord {
  employee: string;
  name: string;
  type?: string;
  file?: string;
  expires_at?: string;
  notes?: string;
}

export interface Bootstrap {
  user: {
    id: string;
    email: string;
    name: string;
    role: "admin" | "manager" | "employee";
    avatar?: string;
  };
  employee: Employee | null;
  company: Company | null;
  locations: Location[];
  is_manager: boolean;
}

export interface PayrollPreview {
  run: PayRun | null;
  stubs: Array<{
    employee: string;
    regular_hours: number;
    overtime_hours: number;
    pto_hours: number;
    regular_pay: number;
    overtime_pay: number;
    pto_pay: number;
    gross_pay: number;
    employee_taxes: number;
    employee_deductions: number;
    employer_taxes: number;
    net_pay: number;
    breakdown: PayLine[];
  }>;
  totals: {
    employees: number;
    gross: number;
    taxes: number;
    deductions: number;
    net: number;
  };
}

export interface AppNotification extends BaseRecord {
  user: string;
  type: "schedule" | "timeoff" | "payroll" | "claim" | "system";
  title: string;
  body?: string;
  link?: string;
  read?: boolean;
}

export interface ShiftSwap {
  id: string;
  status: "open" | "accepted" | "approved" | "denied" | "cancelled";
  note?: string;
  created: string;
  shift: {
    id: string;
    starts_at: string;
    ends_at: string;
    local_date?: string;
    local_start?: string;
    local_end?: string;
    position?: string;
    location?: string;
  };
  offered_by: { id: string; name: string } | null;
  accepted_by: { id: string; name: string } | null;
}
