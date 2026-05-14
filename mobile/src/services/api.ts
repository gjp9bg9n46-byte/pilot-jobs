import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: API_URL });

// Lazy import to avoid any potential circular-reference at module evaluation time.
// store → (does not import api) so there is no true cycle, but lazy is safer for
// test environments where the store may be mocked before this module loads.
function getStore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../store') as typeof import('../store');
}

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('authToken');
      // Skip dispatching logout for calls that explicitly opt out (e.g. the
      // bootstrap me() call, which expects a possible 401 and handles it itself).
      const cfg = error.config as InternalAxiosRequestConfig & { _skipLogoutOn401?: boolean };
      if (!cfg?._skipLogoutOn401) {
        const { store, logout } = getStore();
        store.dispatch(logout());
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  register: (data: RegisterData) => api.post('/auth/register', data),
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  // _skipLogoutOn401: bootstrap calls this and handles 401 itself; we must not
  // also dispatch logout() from the interceptor or the bootstrap finally/catch
  // would race with a Redux update that clears state it hasn't set yet.
  me: () => api.get('/auth/me', { _skipLogoutOn401: true } as any),
  updateFcmToken: (fcmToken: string | null) => api.patch('/auth/fcm-token', { fcmToken }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/auth/change-password', { currentPassword, newPassword }),
  deleteAccount: (password: string) => api.delete('/auth/account', { data: { password } }),
  getSessions: () => api.get('/auth/sessions'),
  deleteSession: (id: string) => api.delete(`/auth/sessions/${id}`),
  deleteAllSessions: () => api.delete('/auth/sessions'),
};

// Profile
export const profileApi = {
  get: () => api.get('/profile'),
  update: (data: any) => api.patch('/profile', data),
  getTotals: () => api.get('/profile/totals'),
  addCertificate: (data: any) => api.post('/profile/certificates', data),
  deleteCertificate: (id: string) => api.delete(`/profile/certificates/${id}`),
  addRating: (data: any) => api.post('/profile/ratings', data),
  deleteRating: (id: string) => api.delete(`/profile/ratings/${id}`),
  addMedical: (data: any) => api.post('/profile/medicals', data),
  deleteMedical: (id: string) => api.delete(`/profile/medicals/${id}`),
  addTraining: (data: any) => api.post('/profile/training', data),
  deleteTraining: (id: string) => api.delete(`/profile/training/${id}`),
  addRightToWork: (data: any) => api.post('/profile/right-to-work', data),
  deleteRightToWork: (id: string) => api.delete(`/profile/right-to-work/${id}`),
  updatePreferences: (data: any) => api.put('/profile/preferences', data),
  updatePrivacy: (data: { profileVisible?: boolean; anonymousBrowsing?: boolean; showSeniority?: boolean }) =>
    api.patch('/profile/privacy', data),
  exportData: () => api.get('/profile/export'),
  getCounts: () => api.get('/profile/counts'),
};

// Flight Logs
export const flightLogApi = {
  list: (page = 1, limit = 50) => api.get('/flight-logs', { params: { page, limit } }),
  create: (data: any) => api.post('/flight-logs', data),
  bulk: (legs: any[]) => api.post('/flight-logs/bulk', { legs }),
  update: (id: string, data: any) => api.patch(`/flight-logs/${id}`, data),
  delete: (id: string) => api.delete(`/flight-logs/${id}`),
  recentAircraft: () => api.get('/flight-logs/recent-aircraft'),
  import: (file: FormData) =>
    api.post('/flight-logs/import', file, { headers: { 'Content-Type': 'multipart/form-data' } }),
  exportCsv: () => api.get('/flight-logs/export/csv', { responseType: 'blob' }),
  exportForeFlight: () => api.get('/flight-logs/export/foreflight', { responseType: 'blob' }),
};

// Jobs
export const jobApi = {
  list: (params?: any, signal?: AbortSignal) => api.get('/jobs', { params, signal }),
  get: (id: string) => api.get(`/jobs/${id}`),
  // Alerts
  getAlerts: (params?: { page?: number; limit?: number; filter?: string; sort?: string }) =>
    api.get('/jobs/alerts', { params }),
  markRead: (id: string) => api.patch(`/jobs/alerts/${id}/read`),
  markAllRead: () => api.patch('/jobs/alerts/read-all'),
  dismissAlert: (id: string) => api.patch(`/jobs/alerts/${id}/dismiss`),
  // Saved jobs
  getSaved: () => api.get('/jobs/saved'),
  saveJob: (id: string) => api.post(`/jobs/${id}/save`),
  unsaveJob: (id: string) => api.delete(`/jobs/${id}/save`),
  // Apply & report
  applyToJob: (id: string) => api.post(`/jobs/${id}/apply`),
  reportJob: (id: string, reason: string) => api.post(`/jobs/${id}/report`, { reason }),
  // Saved searches
  getSavedSearches: () => api.get('/jobs/saved-searches'),
  createSavedSearch: (data: { name: string; filters: object; frequency: string }) =>
    api.post('/jobs/saved-searches', data),
  updateSavedSearch: (id: string, data: Partial<{ name: string; filters: object; frequency: string; paused: boolean }>) =>
    api.patch(`/jobs/saved-searches/${id}`, data),
  deleteSavedSearch: (id: string) => api.delete(`/jobs/saved-searches/${id}`),
};

// Types
export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  country?: string;
  city?: string;
}

export default api;
