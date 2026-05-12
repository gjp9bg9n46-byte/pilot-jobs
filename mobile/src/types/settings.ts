export type Theme = 'light' | 'dark' | 'system';
export type AltitudeUnit = 'ft' | 'm';
export type DistanceUnit = 'nm' | 'km' | 'mi';
export type WindSpeedUnit = 'kt' | 'm/s' | 'km/h';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'auto';
export type Language = 'en';
export type SalaryCurrency = 'USD' | 'EUR' | 'GBP' | 'AED' | 'AUD' | 'SGD' | 'CAD' | 'CHF' | 'JPY';
export type SalaryPeriod = 'year' | 'month';
export type ContractType = 'permanent' | 'fixed-term' | 'acmi' | 'per-diem';
export type RouteType = 'short-haul' | 'medium-haul' | 'long-haul' | 'ultra-long-haul' | 'cargo' | 'corporate';

export interface UIPrefs {
  theme: Theme;
  altitudeUnit: AltitudeUnit;
  distanceUnit: DistanceUnit;
  windSpeedUnit: WindSpeedUnit;
  dateFormat: DateFormat;
  language: Language;
}

export const DEFAULT_UI_PREFS: UIPrefs = {
  theme: 'system',
  altitudeUnit: 'ft',
  distanceUnit: 'nm',
  windSpeedUnit: 'kt',
  dateFormat: 'auto',
  language: 'en',
};

export const SALARY_CURRENCIES: { code: SalaryCurrency; symbol: string; label: string }[] = [
  { code: 'USD', symbol: '$',  label: 'US Dollar'        },
  { code: 'EUR', symbol: '€',  label: 'Euro'             },
  { code: 'GBP', symbol: '£',  label: 'British Pound'    },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham'      },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar'  },
  { code: 'CHF', symbol: 'Fr', label: 'Swiss Franc'      },
  { code: 'JPY', symbol: '¥',  label: 'Japanese Yen'     },
];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  'permanent':  'Permanent',
  'fixed-term': 'Fixed-term',
  'acmi':       'Contract / ACMI',
  'per-diem':   'Per diem',
};

export const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  'short-haul':      'Short-haul',
  'medium-haul':     'Medium-haul',
  'long-haul':       'Long-haul',
  'ultra-long-haul': 'Ultra-long-haul',
  'cargo':           'Cargo',
  'corporate':       'Corporate / bizjet',
};
