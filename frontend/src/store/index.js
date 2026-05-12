import { configureStore, createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: { token: localStorage.getItem('authToken'), pilot: null },
  reducers: {
    setAuth: (state, { payload }) => {
      state.token = payload.token;
      state.pilot = payload.pilot;
      localStorage.setItem('authToken', payload.token);
    },
    logout: (state) => {
      state.token = null;
      state.pilot = null;
      localStorage.removeItem('authToken');
    },
    setPilot: (state, { payload }) => { state.pilot = payload; },
  },
});

const jobsSlice = createSlice({
  name: 'jobs',
  initialState: { list: [], alerts: [], total: 0 },
  reducers: {
    setJobs: (state, { payload }) => { state.list = payload.jobs; state.total = payload.total; },
    setAlerts: (state, { payload }) => { state.alerts = payload; },
    markAlertRead: (state, { payload }) => {
      const a = state.alerts.find((x) => x.id === payload);
      if (a) a.readAt = new Date().toISOString();
    },
  },
});

const logbookSlice = createSlice({
  name: 'logbook',
  initialState: { logs: [], totals: null, total: 0 },
  reducers: {
    setLogs: (state, { payload }) => { state.logs = payload.logs; state.total = payload.total; },
    setTotals: (state, { payload }) => { state.totals = payload; },
    addLog: (state, { payload }) => { state.logs.unshift(payload); },
    removeLog: (state, { payload }) => { state.logs = state.logs.filter((l) => l.id !== payload); },
  },
});

export const { setAuth, logout, setPilot } = authSlice.actions;
export const { setJobs, setAlerts, markAlertRead } = jobsSlice.actions;
export const { setLogs, setTotals, addLog, removeLog } = logbookSlice.actions;

export const store = configureStore({
  reducer: { auth: authSlice.reducer, jobs: jobsSlice.reducer, logbook: logbookSlice.reducer },
});
