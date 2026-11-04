"use client";


export type Language = "en" | "es";

const EN: Record<string, string> = {
  "nav.today": "Today",
  "nav.schedule": "Schedule",
  "nav.timeclock": "Time Clock",
  "nav.timesheets": "Timesheets",
  "nav.timeoff": "Time Off",
  "nav.calendar": "Time-off calendar",
  "nav.swaps": "Swaps",
  "nav.myprofile": "My profile",
  "nav.people": "People",
  "nav.templates": "Shift templates",
  "nav.forecast": "Demand forecast",
  "nav.payroll": "Payroll",
  "nav.reports": "Reports",
  "nav.settings": "Settings",
  "nav.manage": "Manage",
  "nav.workspace": "Workspace",
  "nav.signout": "Sign out",

  "auth.welcome": "Welcome back",
  "auth.signinPrompt": "Sign in to your roster",
  "auth.signinHint": "Use your work email. Your role decides what you can see.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signin": "Sign in",
  "auth.selfHosted": "SELF-HOSTED · ALPHA",
  "auth.testimonial": "Every shift, covered.",
  "auth.unreachable": "Cannot reach PocketBase at {url}",
  "auth.unreachableFix": "Start it with make dev-pb, or point the app elsewhere with NEXT_PUBLIC_PB_URL, then reload.",
  "auth.retry": "Retry",

  "clock.onClock": "On the clock",
  "clock.off": "Time clock",
  "clock.onBreak": "On break",
  "clock.working": "Working",
  "clock.clockedOut": "You are clocked out. Your hours land in this week's timesheet.",
  "clock.clockedInAt": "Clocked in at {time}",
  "clock.onBreakSince": "On break since {time}",
  "clock.in": "Clock in",
  "clock.out": "Clock out",
  "clock.break": "Break",
  "clock.breakEnd": "End break",
  "clock.todaysPunches": "Today's punches",
  "clock.noPunches": "No punches yet today.",
  "clock.queued": "queued",
  "clock.offlineNote": "Offline. Punches are saved on this device and sync when you reconnect.",
  "clock.syncNote": "{count} punch(es) waiting to sync.",
  "clock.syncedToast": "{count} offline punch synced.",
  "clock.offlineSaved": "Saved offline. It will sync when you reconnect.",

  "schedule.publish": "Publish",
  "schedule.autofill": "Auto-fill",
  "schedule.applyTemplates": "Apply templates",
  "schedule.copyWeek": "Copy week",
  "schedule.export": "Export",
  "schedule.addShift": "+ Add shift",
  "schedule.copyShift": "Copy shift",
  "schedule.pasteHere": "Paste here",
  "schedule.repeatNext": "Repeat next week",
  "schedule.repeatNext4": "Repeat next 4 weeks",
  "schedule.delete": "Delete shift",
  "schedule.shiftActions": "Shift actions",
  "schedule.dayActions": "Shift actions",
  "schedule.viewDay": "view day",
  "schedule.copiedToast": "Shift copied. Right-click a day or another shift to paste.",

  "dashboard.openShifts": "Open shifts",
  "dashboard.onToday": "On today",
  "dashboard.hoursPlanned": "Hours planned",
  "schedule.legendTitle": "Departments",
  "schedule.undo": "Undo",
  "schedule.deletedToast": "Shift deleted.",
  "schedule.undoRestored": "Shift restored.",
  "schedule.publishConfirmTitle": "Publish shifts?",
  "schedule.publishConfirmDesc": "The team sees these on their schedule and gets a notification.",
  "schedule.publishNow": "Publish {count}",
  "schedule.cancel": "Cancel",
  "schedule.openShift": "Open",
  "schedule.andMore": "…and {count} more",
  "schedule.actionsHint": "Right-click a shift (or press Shift+F10) for actions",
  "schedule.rangeLabel": "Schedule range",
  "schedule.locationFilter": "Filter by location",
  "schedule.noShifts": "No shifts",
  "schedule.movedToast": "Shift moved to {day}.",
};


const ES: Record<string, string> = {
  "nav.today": "Hoy",
  "nav.schedule": "Horario",
  "nav.timeclock": "Reloj",
  "nav.timesheets": "Hojas de hora",
  "nav.timeoff": "Descansos",
  "nav.calendar": "Calendario de descansos",
  "nav.swaps": "Cambios",
  "nav.myprofile": "Mi perfil",
  "nav.people": "Personal",
  "nav.templates": "Plantillas de turno",
  "nav.forecast": "Pronóstico de demanda",
  "nav.payroll": "Nómina",
  "nav.reports": "Informes",
  "nav.settings": "Ajustes",
  "nav.manage": "Gestión",
  "nav.workspace": "Espacio",
  "nav.signout": "Salir",

  "auth.welcome": "Bienvenido",
  "auth.signinPrompt": "Entra a tu horario",
  "auth.signinHint": "Usa tu correo del trabajo. Tu rol decide lo que puedes ver.",
  "auth.email": "Correo",
  "auth.password": "Contraseña",
  "auth.signin": "Iniciar sesión",
  "auth.selfHosted": "AUTOGESTIONADO · ALFA",
  "auth.testimonial": "Cada turno, cubierto.",
  "auth.unreachable": "No se puede conectar con PocketBase en {url}",
  "auth.unreachableFix": "Arranca el servicio con make dev-pb o apunta NEXT_PUBLIC_PB_URL a otra URL y recarga.",
  "auth.retry": "Reintentar",

  "clock.onClock": "Trabajando",
  "clock.off": "Reloj",
  "clock.onBreak": "En descanso",
  "clock.working": "Trabajando",
  "clock.clockedOut": "Estás fuera de turno. Tus horas van a la hoja de esta semana.",
  "clock.clockedInAt": "Entraste a las {time}",
  "clock.onBreakSince": "En descanso desde las {time}",
  "clock.in": "Entrar",
  "clock.out": "Salir",
  "clock.break": "Descanso",
  "clock.breakEnd": "Terminar descanso",
  "clock.todaysPunches": "Registros de hoy",
  "clock.noPunches": "Aún no hay registros hoy.",
  "clock.queued": "en cola",
  "clock.offlineNote": "Sin conexión. Los registros se guardan en tu equipo y se envían al reconectar.",
  "clock.syncNote": "{count} registro(s) esperando sincronizar.",
  "clock.syncedToast": "{count} registro sincronizado.",
  "clock.offlineSaved": "Guardado sin conexión. Se enviará al reconectar.",

  "schedule.publish": "Publicar",
  "schedule.autofill": "Rellenar",
  "schedule.applyTemplates": "Plantillas",
  "schedule.copyWeek": "Copiar semana",
  "schedule.export": "Exportar",
  "schedule.addShift": "+ Añadir turno",
  "schedule.copyShift": "Copiar turno",
  "schedule.pasteHere": "Pegar aquí",
  "schedule.repeatNext": "Repetir la próxima semana",
  "schedule.repeatNext4": "Repetir 4 semanas",
  "schedule.delete": "Eliminar turno",
  "schedule.shiftActions": "Acciones del turno",
  "schedule.dayActions": "Acciones del turno",
  "schedule.viewDay": "ver el día",
  "schedule.copiedToast": "Turno copiado. Haz clic derecho en un día u otro turno para pegar.",
  "schedule.today": "Hoy",
  "schedule.dayFullyStaffed": "Cubierto",
  "schedule.legendTitle": "Departamentos",

  "dashboard.openShifts": "Turnos abiertos",
  "dashboard.onToday": "Hoy presente",
  "dashboard.hoursPlanned": "Horas planificadas",
  "schedule.undo": "Deshacer",
  "schedule.deletedToast": "Turno eliminado.",
  "schedule.undoRestored": "Turno restaurado.",
  "schedule.publishConfirmTitle": "¿Publicar turnos?",
  "schedule.publishConfirmDesc": "El equipo los ve en su horario y recibe una notificación.",
  "schedule.publishNow": "Publicar {count}",
  "schedule.cancel": "Cancelar",
  "schedule.openShift": "Abierto",
  "schedule.andMore": "…y {count} más",
  "schedule.actionsHint": "Clic derecho en un turno (o Shift+F10) para acciones",
  "schedule.rangeLabel": "Rango del horario",
  "schedule.locationFilter": "Filtrar por ubicación",
  "schedule.noShifts": "Sin turnos",
  "schedule.movedToast": "Turno movido a {day}.",
};

const CATALOGS: Record<Language, Record<string, string>> = { en: EN, es: ES };
export const en = EN;
export const es = ES;

export interface ResolvedLanguage {
  lang: Language;
}

export const LANGUAGES: Array<{ value: "auto" | Language; label: string }> = [
  { value: "auto", label: "Follow company locale" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

export function resolveLanguage(uiLanguage: string | undefined, locale: string | undefined): Language {
  if (uiLanguage === "en" || uiLanguage === "es") return uiLanguage;
  if (uiLanguage && uiLanguage !== "auto") return "en";
  return (locale || "").toLowerCase().startsWith("es") ? "es" : "en";
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function translate(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const message = CATALOGS[lang]?.[key] ?? EN[key] ?? key;
  return interpolate(message, vars);
}
