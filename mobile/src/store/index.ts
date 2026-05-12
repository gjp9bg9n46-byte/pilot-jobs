import { configureStore, createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UIPrefs } from '../types/settings';
import { DEFAULT_UI_PREFS } from '../types/settings';

// ─── Auth slice ───────────────────────────────────────────────────────────────
interface AuthState {
  token: string | null;
  pilot: any | null;
  loading: boolean;
  bootstrapping: boolean;
}
const authSlice = createSlice({
  name: 'auth',
  initialState: { token: null, pilot: null, loading: false, bootstrapping: true } as AuthState,
  reducers: {
    setAuth: (state, action: PayloadAction<{ token: string; pilot: any }>) => {
      state.token = action.payload.token;
      state.pilot = action.payload.pilot;
    },
    logout: (state) => {
      state.token = null;
      state.pilot = null;
    },
    setBootstrapped: (state) => {
      state.bootstrapping = false;
    },
  },
});

// ─── Jobs slice ───────────────────────────────────────────────────────────────
interface JobsState {
  list: any[];
  alerts: any[];
  loading: boolean;
  total: number;
  savedIds: string[];
}
const jobsSlice = createSlice({
  name: 'jobs',
  initialState: { list: [], alerts: [], loading: false, total: 0, savedIds: [] } as JobsState,
  reducers: {
    setJobs: (state, action: PayloadAction<{ jobs: any[]; total: number }>) => {
      state.list = action.payload.jobs;
      state.total = action.payload.total;
    },
    appendJobs: (state, action: PayloadAction<{ jobs: any[]; total: number }>) => {
      state.list = [...state.list, ...action.payload.jobs];
      state.total = action.payload.total;
    },
    setAlerts: (state, action: PayloadAction<any[]>) => {
      state.alerts = action.payload;
    },
    markAlertRead: (state, action: PayloadAction<string>) => {
      const alert = state.alerts.find((a) => a.id === action.payload);
      if (alert) alert.readAt = new Date().toISOString();
    },
    setSavedIds: (state, action: PayloadAction<string[]>) => {
      state.savedIds = action.payload;
    },
    toggleSavedId: (state, action: PayloadAction<string>) => {
      const idx = state.savedIds.indexOf(action.payload);
      if (idx === -1) state.savedIds.push(action.payload);
      else state.savedIds.splice(idx, 1);
    },
  },
});

// ─── Logbook slice ────────────────────────────────────────────────────────────
interface LogbookState {
  logs: any[];
  totals: any | null;
  loading: boolean;
  total: number;
}
const logbookSlice = createSlice({
  name: 'logbook',
  initialState: { logs: [], totals: null, loading: false, total: 0 } as LogbookState,
  reducers: {
    setLogs: (state, action: PayloadAction<{ logs: any[]; total: number }>) => {
      state.logs = action.payload.logs;
      state.total = action.payload.total;
    },
    setTotals: (state, action: PayloadAction<any>) => {
      state.totals = action.payload;
    },
    addLog: (state, action: PayloadAction<any>) => {
      state.logs.unshift(action.payload);
    },
    addLogs: (state, action: PayloadAction<any[]>) => {
      for (const log of action.payload) state.logs.unshift(log);
    },
    appendLogs: (state, action: PayloadAction<{ logs: any[]; total: number }>) => {
      state.logs = [...state.logs, ...action.payload.logs];
      state.total = action.payload.total;
    },
    updateLog: (state, action: PayloadAction<any>) => {
      const idx = state.logs.findIndex((l) => l.id === action.payload.id);
      if (idx !== -1) state.logs[idx] = action.payload;
    },
    removeLog: (state, action: PayloadAction<string>) => {
      state.logs = state.logs.filter((l) => l.id !== action.payload);
    },
  },
});

// ─── UI slice (theme / units / locale) ───────────────────────────────────────
const UI_STORAGE_KEY = '@pilotjobs/ui_prefs';

export const loadUIPrefs = createAsyncThunk('ui/load', async () => {
  try {
    const raw = await AsyncStorage.getItem(UI_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<UIPrefs>) : {};
  } catch {
    return {};
  }
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: DEFAULT_UI_PREFS as UIPrefs,
  reducers: {
    setUIPrefs: (state, action: PayloadAction<Partial<UIPrefs>>) => {
      Object.assign(state, action.payload);
      AsyncStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ ...state, ...action.payload })).catch(() => {});
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUIPrefs.fulfilled, (state, action) => {
      Object.assign(state, action.payload);
    });
  },
});

export const { setAuth, logout, setBootstrapped } = authSlice.actions;
export const { setJobs, appendJobs, setAlerts, markAlertRead, setSavedIds, toggleSavedId } = jobsSlice.actions;
export const { setLogs, setTotals, addLog, addLogs, appendLogs, updateLog, removeLog } = logbookSlice.actions;
export const { setUIPrefs } = uiSlice.actions;

export const store = configureStore({
  reducer: {
    auth:    authSlice.reducer,
    jobs:    jobsSlice.reducer,
    logbook: logbookSlice.reducer,
    ui:      uiSlice.reducer,
  },
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
