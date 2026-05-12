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
  me: () => api.get('/auth/me'),
  updateFcmToken: (fcmToken) => api.patch('/auth/fcm-token', { fcmToken }),
};

export const profileApi = {
  get: () => api.get('/profile'),
  update: (data) => api.patch('/profile', data),
  getTotals: () => api.get('/profile/totals'),
  addCertificate: (data) => api.post('/profile/certificates', data),
  deleteCertificate: (id) => api.delete(`/profile/certificates/${id}`),
  addRating: (data) => api.post('/profile/ratings', data),
  deleteRating: (id) => api.delete(`/profile/ratings/${id}`),
  addMedical: (data) => api.post('/profile/medicals', data),
  deleteMedical: (id) => api.delete(`/profile/medicals/${id}`),
  updatePreferences: (data) => api.put('/profile/preferences', data),
};

export const flightLogApi = {
  list: (page = 1) => api.get('/flight-logs', { params: { page, limit: 50 } }),
  create: (data) => api.post('/flight-logs', data),
  update: (id, data) => api.patch(`/flight-logs/${id}`, data),
  delete: (id) => api.delete(`/flight-logs/${id}`),
  import: (formData) => api.post('/flight-logs/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

export const jobApi = {
  list: (params) => api.get('/jobs', { params }),
  get: (id) => api.get(`/jobs/${id}`),
  getAlerts: () => api.get('/jobs/alerts'),
  markRead: (id) => api.patch(`/jobs/alerts/${id}/read`),
};

export default api;
