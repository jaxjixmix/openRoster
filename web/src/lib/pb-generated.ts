/**
* This file was @generated using pocketbase-typegen
*/

export const Collections = {
	Authorigins: "_authOrigins",
	Externalauths: "_externalAuths",
	Mfas: "_mfas",
	Otps: "_otps",
	Superusers: "_superusers",
	AuditLog: "audit_log",
	Availability: "availability",
	BlackoutDates: "blackout_dates",
	Certifications: "certifications",
	Companies: "companies",
	Departments: "departments",
	Documents: "documents",
	EmployeeCertifications: "employee_certifications",
	Employees: "employees",
	Holidays: "holidays",
	KioskPins: "kiosk_pins",
	Locations: "locations",
	Notifications: "notifications",
	PayPeriods: "pay_periods",
	PayRules: "pay_rules",
	PayRuns: "pay_runs",
	PayStubs: "pay_stubs",
	Positions: "positions",
	PtoEntries: "pto_entries",
	Punches: "punches",
	ShiftSwaps: "shift_swaps",
	ShiftTemplates: "shift_templates",
	Shifts: "shifts",
	TimeOffRequests: "time_off_requests",
	TimesheetEntries: "timesheet_entries",
	Timesheets: "timesheets",
	Users: "users",
} as const
export type Collections = typeof Collections[keyof typeof Collections]

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export const AuditLogActionOptions = {
	"create": "create",
	"update": "update",
	"delete": "delete",
	"clock": "clock",
	"payroll": "payroll",
	"schedule": "schedule",
} as const
export type AuditLogActionOptions = typeof AuditLogActionOptions[keyof typeof AuditLogActionOptions]
export type AuditLogRecord<Tafter = unknown, Tbefore = unknown> = {
	action?: AuditLogActionOptions
	actor?: RecordIdString
	after?: null | Tafter
	at?: IsoDateString
	before?: null | Tbefore
	collection?: string
	created: IsoAutoDateString
	id: string
	record_id?: string
	summary?: string
	updated: IsoAutoDateString
}

export const AvailabilityWeekdayOptions = {
	"E0": "0",
	"E1": "1",
	"E2": "2",
	"E3": "3",
	"E4": "4",
	"E5": "5",
	"E6": "6",
} as const
export type AvailabilityWeekdayOptions = typeof AvailabilityWeekdayOptions[keyof typeof AvailabilityWeekdayOptions]
export type AvailabilityRecord = {
	created: IsoAutoDateString
	effective_from?: IsoDateString
	effective_to?: IsoDateString
	employee: RecordIdString
	end_time: string
	id: string
	notes?: string
	start_time: string
	updated: IsoAutoDateString
	weekday: AvailabilityWeekdayOptions
}

export type BlackoutDatesRecord = {
	active?: boolean
	company: RecordIdString
	created: IsoAutoDateString
	end_date: IsoDateString
	id: string
	name: string
	note?: string
	start_date: IsoDateString
	updated: IsoAutoDateString
}

export type CertificationsRecord = {
	active?: boolean
	company: RecordIdString
	created: IsoAutoDateString
	description?: string
	id: string
	name: string
	updated: IsoAutoDateString
}

export const CompaniesWeekStartOptions = {
	"E0": "0",
	"E1": "1",
	"E2": "2",
	"E3": "3",
	"E4": "4",
	"E5": "5",
	"E6": "6",
} as const
export type CompaniesWeekStartOptions = typeof CompaniesWeekStartOptions[keyof typeof CompaniesWeekStartOptions]

export const CompaniesPayFrequencyOptions = {
	"weekly": "weekly",
	"biweekly": "biweekly",
	"semimonthly": "semimonthly",
	"monthly": "monthly",
} as const
export type CompaniesPayFrequencyOptions = typeof CompaniesPayFrequencyOptions[keyof typeof CompaniesPayFrequencyOptions]
export type CompaniesRecord = {
	address?: string
	created: IsoAutoDateString
	currency?: string
	expiry_reminder_days?: number
	id: string
	legal_name?: string
	locale?: string
	logo?: FileNameString
	name: string
	overtime_daily_hours?: number
	overtime_multiplier?: number
	overtime_weekly_hours?: number
	pay_frequency?: CompaniesPayFrequencyOptions
	phone?: string
	pto_accrual_hours_per_hour?: number
	pto_accrual_hours_per_period?: number
	punch_rounding_minutes?: number
	setup_complete?: boolean
	timezone?: string
	updated: IsoAutoDateString
	week_start?: CompaniesWeekStartOptions
	weekly_labor_budget?: number
}

export type DepartmentsRecord = {
	color?: string
	company: RecordIdString
	created: IsoAutoDateString
	id: string
	name: string
	updated: IsoAutoDateString
}

export const DocumentsTypeOptions = {
	"contract": "contract",
	"id": "id",
	"w9": "w9",
	"certification": "certification",
	"other": "other",
} as const
export type DocumentsTypeOptions = typeof DocumentsTypeOptions[keyof typeof DocumentsTypeOptions]
export type DocumentsRecord = {
	created: IsoAutoDateString
	employee: RecordIdString
	expires_at?: IsoDateString
	file?: FileNameString
	id: string
	name: string
	notes?: string
	type?: DocumentsTypeOptions
	updated: IsoAutoDateString
}

export type EmployeeCertificationsRecord = {
	certification: RecordIdString
	company: RecordIdString
	created: IsoAutoDateString
	employee: RecordIdString
	expires_at?: IsoDateString
	id: string
	issued_at?: IsoDateString
	note?: string
	updated: IsoAutoDateString
}

export const EmployeesEmploymentTypeOptions = {
	"full_time": "full_time",
	"part_time": "part_time",
	"contractor": "contractor",
} as const
export type EmployeesEmploymentTypeOptions = typeof EmployeesEmploymentTypeOptions[keyof typeof EmployeesEmploymentTypeOptions]

export const EmployeesPayTypeOptions = {
	"hourly": "hourly",
	"salary": "salary",
} as const
export type EmployeesPayTypeOptions = typeof EmployeesPayTypeOptions[keyof typeof EmployeesPayTypeOptions]

export const EmployeesStatusOptions = {
	"active": "active",
	"inactive": "inactive",
	"archived": "archived",
} as const
export type EmployeesStatusOptions = typeof EmployeesStatusOptions[keyof typeof EmployeesStatusOptions]
export type EmployeesRecord = {
	archived_at?: IsoDateString
	company: RecordIdString
	created: IsoAutoDateString
	department?: RecordIdString
	email?: string
	employee_number?: string
	employment_type?: EmployeesEmploymentTypeOptions
	first_name: string
	hire_date?: IsoDateString
	id: string
	last_name: string
	location?: RecordIdString
	manager?: RecordIdString
	max_weekly_hours?: number
	notes?: string
	overtime_exempt?: boolean
	pay_rate?: number
	pay_type?: EmployeesPayTypeOptions
	phone?: string
	position?: RecordIdString
	pto_balance_hours?: number
	status?: EmployeesStatusOptions
	termination_date?: IsoDateString
	updated: IsoAutoDateString
	user?: RecordIdString
}

export type HolidaysRecord = {
	company: RecordIdString
	created: IsoAutoDateString
	date: IsoDateString
	id: string
	name: string
	paid?: boolean
	updated: IsoAutoDateString
}

export type KioskPinsRecord = {
	company: RecordIdString
	created: IsoAutoDateString
	enabled?: boolean
	id: string
	pin: string
	updated: IsoAutoDateString
}

export type LocationsRecord = {
	active?: boolean
	address?: string
	company: RecordIdString
	created: IsoAutoDateString
	geofence_meters?: number
	id: string
	lat?: number
	lng?: number
	name: string
	timezone?: string
	updated: IsoAutoDateString
}

export const NotificationsTypeOptions = {
	"schedule": "schedule",
	"timeoff": "timeoff",
	"payroll": "payroll",
	"claim": "claim",
	"system": "system",
} as const
export type NotificationsTypeOptions = typeof NotificationsTypeOptions[keyof typeof NotificationsTypeOptions]
export type NotificationsRecord = {
	body?: string
	created: IsoAutoDateString
	id: string
	link?: string
	read?: boolean
	title: string
	type: NotificationsTypeOptions
	updated: IsoAutoDateString
	user: RecordIdString
}

export const PayPeriodsStatusOptions = {
	"open": "open",
	"closed": "closed",
} as const
export type PayPeriodsStatusOptions = typeof PayPeriodsStatusOptions[keyof typeof PayPeriodsStatusOptions]
export type PayPeriodsRecord = {
	company: RecordIdString
	created: IsoAutoDateString
	created_by?: RecordIdString
	id: string
	locked_at?: IsoDateString
	pay_date?: IsoDateString
	period_end: IsoDateString
	period_start: IsoDateString
	status?: PayPeriodsStatusOptions
	updated: IsoAutoDateString
}

export const PayRulesTypeOptions = {
	"federal_tax": "federal_tax",
	"state_tax": "state_tax",
	"social_security": "social_security",
	"medicare": "medicare",
	"health": "health",
	"retirement": "retirement",
	"garnishment": "garnishment",
	"other": "other",
} as const
export type PayRulesTypeOptions = typeof PayRulesTypeOptions[keyof typeof PayRulesTypeOptions]

export const PayRulesCalcOptions = {
	"percent": "percent",
	"fixed_per_hour": "fixed_per_hour",
	"fixed_per_period": "fixed_per_period",
} as const
export type PayRulesCalcOptions = typeof PayRulesCalcOptions[keyof typeof PayRulesCalcOptions]

export const PayRulesAppliesToOptions = {
	"gross": "gross",
	"regular": "regular",
	"total_hours": "total_hours",
} as const
export type PayRulesAppliesToOptions = typeof PayRulesAppliesToOptions[keyof typeof PayRulesAppliesToOptions]
export type PayRulesRecord = {
	active?: boolean
	applies_to?: PayRulesAppliesToOptions
	calc: PayRulesCalcOptions
	company: RecordIdString
	created: IsoAutoDateString
	employer?: boolean
	id: string
	name: string
	rate?: number
	type: PayRulesTypeOptions
	updated: IsoAutoDateString
}

export const PayRunsStatusOptions = {
	"draft": "draft",
	"approved": "approved",
	"paid": "paid",
	"voided": "voided",
} as const
export type PayRunsStatusOptions = typeof PayRunsStatusOptions[keyof typeof PayRunsStatusOptions]
export type PayRunsRecord = {
	company: RecordIdString
	created: IsoAutoDateString
	created_by?: RecordIdString
	id: string
	notes?: string
	pay_date?: IsoDateString
	period_end: IsoDateString
	period_start: IsoDateString
	status?: PayRunsStatusOptions
	total_deductions?: number
	total_gross?: number
	total_net?: number
	total_tax?: number
	updated: IsoAutoDateString
	void_reason?: string
	voided_at?: IsoDateString
}

export type PayStubsRecord<Tbreakdown = unknown> = {
	breakdown?: null | Tbreakdown
	created: IsoAutoDateString
	employee: RecordIdString
	employee_deductions?: number
	employee_taxes?: number
	employer_taxes?: number
	gross_pay?: number
	id: string
	net_pay?: number
	overtime_hours?: number
	overtime_pay?: number
	pay_run: RecordIdString
	pto_hours?: number
	pto_pay?: number
	regular_hours?: number
	regular_pay?: number
	updated: IsoAutoDateString
}

export type PositionsRecord = {
	active?: boolean
	company: RecordIdString
	created: IsoAutoDateString
	default_rate?: number
	department?: RecordIdString
	id: string
	name: string
	required_certifications?: RecordIdString[]
	updated: IsoAutoDateString
}

export const PtoEntriesTypeOptions = {
	"accrual": "accrual",
	"usage": "usage",
	"adjustment": "adjustment",
	"carryover": "carryover",
} as const
export type PtoEntriesTypeOptions = typeof PtoEntriesTypeOptions[keyof typeof PtoEntriesTypeOptions]
export type PtoEntriesRecord = {
	company: RecordIdString
	created: IsoAutoDateString
	created_by?: RecordIdString
	date: IsoDateString
	employee: RecordIdString
	hours: number
	id: string
	note?: string
	period_start?: IsoDateString
	time_off_request?: RecordIdString
	type: PtoEntriesTypeOptions
	updated: IsoAutoDateString
}

export const PunchesTypeOptions = {
	"in": "in",
	"out": "out",
	"break_start": "break_start",
	"break_end": "break_end",
} as const
export type PunchesTypeOptions = typeof PunchesTypeOptions[keyof typeof PunchesTypeOptions]

export const PunchesSourceOptions = {
	"web": "web",
	"kiosk": "kiosk",
	"mobile": "mobile",
	"admin": "admin",
} as const
export type PunchesSourceOptions = typeof PunchesSourceOptions[keyof typeof PunchesSourceOptions]
export type PunchesRecord = {
	created: IsoAutoDateString
	created_by?: RecordIdString
	employee: RecordIdString
	id: string
	lat?: number
	lng?: number
	location?: RecordIdString
	note?: string
	punched_at: IsoDateString
	source?: PunchesSourceOptions
	type: PunchesTypeOptions
	updated: IsoAutoDateString
}

export const ShiftSwapsStatusOptions = {
	"open": "open",
	"accepted": "accepted",
	"approved": "approved",
	"denied": "denied",
	"cancelled": "cancelled",
} as const
export type ShiftSwapsStatusOptions = typeof ShiftSwapsStatusOptions[keyof typeof ShiftSwapsStatusOptions]
export type ShiftSwapsRecord = {
	accepted_by?: RecordIdString
	created: IsoAutoDateString
	created_by?: RecordIdString
	id: string
	note?: string
	offered_by: RecordIdString
	shift: RecordIdString
	status?: ShiftSwapsStatusOptions
	updated: IsoAutoDateString
}

export const ShiftTemplatesWeekdayOptions = {
	"E0": "0",
	"E1": "1",
	"E2": "2",
	"E3": "3",
	"E4": "4",
	"E5": "5",
	"E6": "6",
} as const
export type ShiftTemplatesWeekdayOptions = typeof ShiftTemplatesWeekdayOptions[keyof typeof ShiftTemplatesWeekdayOptions]
export type ShiftTemplatesRecord = {
	active?: boolean
	break_minutes?: number
	company: RecordIdString
	created: IsoAutoDateString
	department?: RecordIdString
	employee?: RecordIdString
	end_time: string
	id: string
	location?: RecordIdString
	notes?: string
	position?: RecordIdString
	start_time: string
	updated: IsoAutoDateString
	weekday: ShiftTemplatesWeekdayOptions
}

export const ShiftsStatusOptions = {
	"draft": "draft",
	"published": "published",
} as const
export type ShiftsStatusOptions = typeof ShiftsStatusOptions[keyof typeof ShiftsStatusOptions]

export const ShiftsSourceOptions = {
	"manual": "manual",
	"auto": "auto",
	"swap": "swap",
} as const
export type ShiftsSourceOptions = typeof ShiftsSourceOptions[keyof typeof ShiftsSourceOptions]
export type ShiftsRecord = {
	break_minutes?: number
	company: RecordIdString
	created: IsoAutoDateString
	created_by?: RecordIdString
	department?: RecordIdString
	employee?: RecordIdString
	ends_at: IsoDateString
	id: string
	local_date?: IsoDateString
	local_end?: string
	local_start?: string
	location?: RecordIdString
	notes?: string
	position?: RecordIdString
	source?: ShiftsSourceOptions
	starts_at: IsoDateString
	status?: ShiftsStatusOptions
	template?: RecordIdString
	updated: IsoAutoDateString
}

export const TimeOffRequestsTypeOptions = {
	"vacation": "vacation",
	"sick": "sick",
	"unpaid": "unpaid",
	"other": "other",
} as const
export type TimeOffRequestsTypeOptions = typeof TimeOffRequestsTypeOptions[keyof typeof TimeOffRequestsTypeOptions]

export const TimeOffRequestsStatusOptions = {
	"pending": "pending",
	"approved": "approved",
	"denied": "denied",
} as const
export type TimeOffRequestsStatusOptions = typeof TimeOffRequestsStatusOptions[keyof typeof TimeOffRequestsStatusOptions]
export type TimeOffRequestsRecord = {
	approved_by?: RecordIdString
	created: IsoAutoDateString
	employee: RecordIdString
	end_date: IsoDateString
	hours?: number
	id: string
	note?: string
	start_date: IsoDateString
	status?: TimeOffRequestsStatusOptions
	type: TimeOffRequestsTypeOptions
	updated: IsoAutoDateString
}

export type TimesheetEntriesRecord = {
	created: IsoAutoDateString
	date: IsoDateString
	employee: RecordIdString
	id: string
	note?: string
	overtime_hours?: number
	pto_hours?: number
	regular_hours?: number
	shift?: RecordIdString
	timesheet: RecordIdString
	updated: IsoAutoDateString
}

export const TimesheetsStatusOptions = {
	"open": "open",
	"submitted": "submitted",
	"approved": "approved",
	"paid": "paid",
} as const
export type TimesheetsStatusOptions = typeof TimesheetsStatusOptions[keyof typeof TimesheetsStatusOptions]
export type TimesheetsRecord = {
	approved_at?: IsoDateString
	approved_by?: RecordIdString
	created: IsoAutoDateString
	employee: RecordIdString
	id: string
	notes?: string
	overtime_hours?: number
	period_end: IsoDateString
	period_start: IsoDateString
	pto_hours?: number
	regular_hours?: number
	status?: TimesheetsStatusOptions
	total_hours?: number
	updated: IsoAutoDateString
}

export const UsersRoleOptions = {
	"admin": "admin",
	"manager": "manager",
	"employee": "employee",
} as const
export type UsersRoleOptions = typeof UsersRoleOptions[keyof typeof UsersRoleOptions]
export type UsersRecord<Tnotification_prefs = unknown> = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	notification_prefs?: null | Tnotification_prefs
	password: string
	phone?: string
	role?: UsersRoleOptions
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type AuditLogResponse<Tafter = unknown, Tbefore = unknown, Texpand = unknown> = Required<AuditLogRecord<Tafter, Tbefore>> & BaseSystemFields<Texpand>
export type AvailabilityResponse<Texpand = unknown> = Required<AvailabilityRecord> & BaseSystemFields<Texpand>
export type BlackoutDatesResponse<Texpand = unknown> = Required<BlackoutDatesRecord> & BaseSystemFields<Texpand>
export type CertificationsResponse<Texpand = unknown> = Required<CertificationsRecord> & BaseSystemFields<Texpand>
export type CompaniesResponse<Texpand = unknown> = Required<CompaniesRecord> & BaseSystemFields<Texpand>
export type DepartmentsResponse<Texpand = unknown> = Required<DepartmentsRecord> & BaseSystemFields<Texpand>
export type DocumentsResponse<Texpand = unknown> = Required<DocumentsRecord> & BaseSystemFields<Texpand>
export type EmployeeCertificationsResponse<Texpand = unknown> = Required<EmployeeCertificationsRecord> & BaseSystemFields<Texpand>
export type EmployeesResponse<Texpand = unknown> = Required<EmployeesRecord> & BaseSystemFields<Texpand>
export type HolidaysResponse<Texpand = unknown> = Required<HolidaysRecord> & BaseSystemFields<Texpand>
export type KioskPinsResponse<Texpand = unknown> = Required<KioskPinsRecord> & BaseSystemFields<Texpand>
export type LocationsResponse<Texpand = unknown> = Required<LocationsRecord> & BaseSystemFields<Texpand>
export type NotificationsResponse<Texpand = unknown> = Required<NotificationsRecord> & BaseSystemFields<Texpand>
export type PayPeriodsResponse<Texpand = unknown> = Required<PayPeriodsRecord> & BaseSystemFields<Texpand>
export type PayRulesResponse<Texpand = unknown> = Required<PayRulesRecord> & BaseSystemFields<Texpand>
export type PayRunsResponse<Texpand = unknown> = Required<PayRunsRecord> & BaseSystemFields<Texpand>
export type PayStubsResponse<Tbreakdown = unknown, Texpand = unknown> = Required<PayStubsRecord<Tbreakdown>> & BaseSystemFields<Texpand>
export type PositionsResponse<Texpand = unknown> = Required<PositionsRecord> & BaseSystemFields<Texpand>
export type PtoEntriesResponse<Texpand = unknown> = Required<PtoEntriesRecord> & BaseSystemFields<Texpand>
export type PunchesResponse<Texpand = unknown> = Required<PunchesRecord> & BaseSystemFields<Texpand>
export type ShiftSwapsResponse<Texpand = unknown> = Required<ShiftSwapsRecord> & BaseSystemFields<Texpand>
export type ShiftTemplatesResponse<Texpand = unknown> = Required<ShiftTemplatesRecord> & BaseSystemFields<Texpand>
export type ShiftsResponse<Texpand = unknown> = Required<ShiftsRecord> & BaseSystemFields<Texpand>
export type TimeOffRequestsResponse<Texpand = unknown> = Required<TimeOffRequestsRecord> & BaseSystemFields<Texpand>
export type TimesheetEntriesResponse<Texpand = unknown> = Required<TimesheetEntriesRecord> & BaseSystemFields<Texpand>
export type TimesheetsResponse<Texpand = unknown> = Required<TimesheetsRecord> & BaseSystemFields<Texpand>
export type UsersResponse<Tnotification_prefs = unknown, Texpand = unknown> = Required<UsersRecord<Tnotification_prefs>> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	audit_log: AuditLogRecord
	availability: AvailabilityRecord
	blackout_dates: BlackoutDatesRecord
	certifications: CertificationsRecord
	companies: CompaniesRecord
	departments: DepartmentsRecord
	documents: DocumentsRecord
	employee_certifications: EmployeeCertificationsRecord
	employees: EmployeesRecord
	holidays: HolidaysRecord
	kiosk_pins: KioskPinsRecord
	locations: LocationsRecord
	notifications: NotificationsRecord
	pay_periods: PayPeriodsRecord
	pay_rules: PayRulesRecord
	pay_runs: PayRunsRecord
	pay_stubs: PayStubsRecord
	positions: PositionsRecord
	pto_entries: PtoEntriesRecord
	punches: PunchesRecord
	shift_swaps: ShiftSwapsRecord
	shift_templates: ShiftTemplatesRecord
	shifts: ShiftsRecord
	time_off_requests: TimeOffRequestsRecord
	timesheet_entries: TimesheetEntriesRecord
	timesheets: TimesheetsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	audit_log: AuditLogResponse
	availability: AvailabilityResponse
	blackout_dates: BlackoutDatesResponse
	certifications: CertificationsResponse
	companies: CompaniesResponse
	departments: DepartmentsResponse
	documents: DocumentsResponse
	employee_certifications: EmployeeCertificationsResponse
	employees: EmployeesResponse
	holidays: HolidaysResponse
	kiosk_pins: KioskPinsResponse
	locations: LocationsResponse
	notifications: NotificationsResponse
	pay_periods: PayPeriodsResponse
	pay_rules: PayRulesResponse
	pay_runs: PayRunsResponse
	pay_stubs: PayStubsResponse
	positions: PositionsResponse
	pto_entries: PtoEntriesResponse
	punches: PunchesResponse
	shift_swaps: ShiftSwapsResponse
	shift_templates: ShiftTemplatesResponse
	shifts: ShiftsResponse
	time_off_requests: TimeOffRequestsResponse
	timesheet_entries: TimesheetEntriesResponse
	timesheets: TimesheetsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>
