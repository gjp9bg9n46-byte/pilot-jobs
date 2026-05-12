export interface FlightLog {
  id: string;
  pilotId: string;
  date: string; // ISO
  aircraftType: string;
  registration: string | null;
  departure: string | null;
  arrival: string | null;
  totalTime: number;
  picTime: number;
  sicTime: number;
  multiEngineTime: number;
  turbineTime: number;
  instrumentTime: number;
  nightTime: number;
  landingsDay: number;
  landingsNight: number;
  remarks: string | null;
  source: 'MANUAL' | 'FOREFLIGHT' | 'LOGBOOK_PRO' | 'OTHER';
  createdAt: string;
  updatedAt: string;
}

export interface FlightTotals {
  totalTime: number;
  picTime: number;
  sicTime: number;
  multiEngineTime: number;
  turbineTime: number;
  instrumentTime: number;
  nightTime: number;
  landingsDay: number;
  landingsNight: number;
}

export interface RecentAircraft {
  types: string[];
  regByType: Record<string, string[]>;
}

// One leg inside AddLogScreen (may be saved as a separate FlightLog row)
export interface LegState {
  key: string;
  departure: string;
  arrival: string;
  depLat: number | null;
  depLon: number | null;
  arrLat: number | null;
  arrLon: number | null;
  blockOff: Date | null;
  blockOn: Date | null;
  totalTimeManual: string; // used in edit mode when block times aren't known
  picTime: number;
  sicTime: number;
  multiEngineTime: number;
  turbineTime: number;
  instrumentTime: number;
  nightTime: number;
  nightOverridden: boolean;
  landingsDay: number;
  landingsNight: number;
  collapsed: boolean;
}

export interface PendingLog {
  outboxId: string;
  pendingAt: string;
  payload: Omit<FlightLog, 'id' | 'pilotId' | 'createdAt' | 'updatedAt'>;
}
