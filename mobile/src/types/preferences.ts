export interface NotifChannel {
  push: boolean;
  email: boolean;
}

export interface NotificationPrefs {
  allPush: boolean;
  allEmail: boolean;
  matches: NotifChannel;
  savedAlerts: NotifChannel;
  applications: NotifChannel;
  expiries: NotifChannel;
  digest: NotifChannel;
  productUpdates: NotifChannel;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:mm"
  quietHoursEnd: string;   // "HH:mm"
  quietHoursTz: string;
}

export interface JobPrefs {
  preferredCountries: string[];
  preferredAircraft: string[];
  preferredContractTypes: string[];
  routePreferences: string[];
  minSalary: number | null;
  minSalaryCurrency: string;
  minSalaryPeriod: 'year' | 'month';
  salaryNegotiable: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  allPush: true,
  allEmail: true,
  matches:        { push: true,  email: true  },
  savedAlerts:    { push: true,  email: false },
  applications:   { push: true,  email: true  },
  expiries:       { push: true,  email: true  },
  digest:         { push: false, email: true  },
  productUpdates: { push: false, email: true  },
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export const DEFAULT_JOB_PREFS: JobPrefs = {
  preferredCountries: [],
  preferredAircraft: [],
  preferredContractTypes: [],
  routePreferences: [],
  minSalary: null,
  minSalaryCurrency: 'USD',
  minSalaryPeriod: 'year',
  salaryNegotiable: false,
};
