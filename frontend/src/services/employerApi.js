import axios from 'axios';

// Employer-only axios instance. Completely separate from the pilot api.js:
// it reads/writes ONLY localStorage.employerToken and never touches authToken.
const client = axios.create({ baseURL: '/api' });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('employerToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('employerToken');
    }
    return Promise.reject(error);
  }
);

export const employerApi = {
  register: (payload) => client.post('/employers/register', payload),
  // Backend expects { contactEmail, password }
  login: (email, password) => client.post('/employers/login', { contactEmail: email, password }),
  getMe: () => client.get('/employers/me'),
  updateMe: (payload) => client.put('/employers/me', payload),
  // Jobs (employer-owned)
  listJobs: () => client.get('/employers/jobs'),
  createJob: (payload) => client.post('/employers/jobs', payload),
  updateJob: (id, payload) => client.put(`/employers/jobs/${id}`, payload),
  deleteJob: (id) => client.delete(`/employers/jobs/${id}`),
  repostJob: (id) => client.post(`/employers/jobs/${id}/repost`),
};

export default client;
