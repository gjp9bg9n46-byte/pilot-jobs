import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (email, password) => api.post('/auth/login', { email, password }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, newPassword }),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/resend-verification'),
  me: () => api.get('/auth/me'),
  updateFcmToken: (fcmToken) => api.patch('/auth/fcm-token', { fcmToken }),
  exportData: () => api.get('/auth/export', { responseType: 'blob' }),
  deleteAccount: () => api.delete('/auth/account'),
};

export const profileApi = {
  get: () => api.get('/profile'),
  update: (data) => api.patch('/profile', data),
  getTotals: () => api.get('/profile/totals'),
  getAirports: () => api.get('/profile/airports'),
  getCarryForward: () => api.get('/profile/carry-forward'),
  updateCarryForward: (data) => api.put('/profile/carry-forward', data),
  addCertificate: (data) => api.post('/profile/certificates', data),
  deleteCertificate: (id) => api.delete(`/profile/certificates/${id}`),
  addRating: (data) => api.post('/profile/ratings', data),
  deleteRating: (id) => api.delete(`/profile/ratings/${id}`),
  addMedical: (data) => api.post('/profile/medicals', data),
  deleteMedical: (id) => api.delete(`/profile/medicals/${id}`),
  updatePreferences: (data) => api.put('/profile/preferences', data),
  getRecurrent: () => api.get('/profile/recurrent'),
  addRecurrent: (data) => api.post('/profile/recurrent', data),
  deleteRecurrent: (id) => api.delete(`/profile/recurrent/${id}`),
  getRTW: () => api.get('/profile/rtw'),
  addRTW: (data) => api.post('/profile/rtw', data),
  deleteRTW: (id) => api.delete(`/profile/rtw/${id}`),
  getELP: () => api.get('/profile/elp'),
  addELP: (data) => api.post('/profile/elp', data),
  deleteELP: (id) => api.delete(`/profile/elp/${id}`),
};

export const flightLogApi = {
  list: (page = 1, limit = 50) => api.get('/flight-logs', { params: { page, limit } }),
  create: (data) => api.post('/flight-logs', data),
  bulkCreate: (data) => api.post('/flight-logs/bulk', data),
  update: (id, data) => api.patch(`/flight-logs/${id}`, data),
  delete: (id) => api.delete(`/flight-logs/${id}`),
  import: (formData) => api.post('/flight-logs/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  export: (format) => api.get('/flight-logs/export', { params: { format }, responseType: 'blob' }),
  importParse: (formData) => api.post('/flight-logs/import/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // 60s timeout — chunked bulk insert finishes in ~1-3s even at the 5k cap, so a
  // hang past 60s means something's wrong; fail cleanly instead of waiting forever.
  importConfirm: (rows) => api.post('/flight-logs/import/confirm', { rows }, { timeout: 60000 }),
};



export const jobApi = {
  list: (params) => api.get('/jobs', { params }),
  get: (id) => api.get(`/jobs/${id}`),
  getAlerts: (params) => api.get('/jobs/alerts', { params }),
  getUnreadCount: () => api.get('/jobs/alerts/unread-count'),
  markRead: (id) => api.patch(`/jobs/alerts/${id}/read`),
  markAllAlertsRead: () => api.patch('/jobs/alerts/read-all'),
  getSavedSearches: () => api.get('/jobs/saved-searches'),
  createSavedSearch: (data) => api.post('/jobs/saved-searches', data),
  updateSavedSearch: (id, data) => api.patch(`/jobs/saved-searches/${id}`, data),
  deleteSavedSearch: (id) => api.delete(`/jobs/saved-searches/${id}`),
  saveJob: (id) => api.post(`/jobs/${id}/save`),
  unsaveJob: (id) => api.delete(`/jobs/${id}/save`),
  triggerMatch: () => api.post('/jobs/alerts/run-match'),
  // E1: records the application (+ snapshots match) and returns { applied, applyUrl, matchScore }
  apply: (id) => api.post(`/jobs/${id}/apply`),
  getApplications: () => api.get('/jobs/applications'),
};

export const airlineApi = {
  list: (params) => api.get('/airlines', { params }),
  get: (id) => api.get(`/airlines/${id}`),
  getJobCount: (id) => api.get(`/airlines/${id}/job-count`),
  contribute: (id, proposedChanges) => api.post(`/airlines/${id}/contributions`, { proposedChanges }),
  getMine: (id) => api.get(`/airlines/${id}/contributions/mine`),
};

export const cvApi = {
  getData:      ()         => api.get('/cv'),
  update:       (data)     => api.put('/cv', data),
  uploadPhoto:  (formData) => api.post('/cv/photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deletePhoto:  ()         => api.delete('/cv/photo'),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  sendTestNotification: () => api.post('/admin/notifications/test'),
  getContributions: (params) => api.get('/admin/contributions', { params }),
  approve: (id) => api.post(`/admin/contributions/${id}/approve`),
  reject: (id, note) => api.post(`/admin/contributions/${id}/reject`, { note }),
  // Employer moderation
  listEmployers: () => api.get('/admin/employers'),
  listPendingEmployers: () => api.get('/admin/employers/pending'),
  approveEmployer: (id) => api.post(`/admin/employers/${id}/approve`),
  rejectEmployer: (id, reason) => api.post(`/admin/employers/${id}/reject`, { reason }),
  suspendEmployer: (id, reason) => api.post(`/admin/employers/${id}/suspend`, { reason }),
};

export default api;
