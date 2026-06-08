import axios from 'axios';

// ✅ نستعملو /api مباشرة — Next.js كيوجهها لـ localhost:4000
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  // For FormData uploads: remove Content-Type so browser sets multipart/form-data with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Shared refresh promise — ensures only ONE refresh request is in-flight at a time.
// If multiple requests 401 simultaneously, they all wait for the same refresh.
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/auth/refresh', {}, { withCredentials: true })
            .then(({ data }) => {
              localStorage.setItem('access_token', data.access_token);
              return data.access_token as string;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('access_token');
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh'),
};

export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
  generatePassword: () => api.get('/users/generate-password'),
  stats: () => api.get('/users/stats'),
};

export const companyApi = {
  get: () => api.get('/company'),
  update: (data: any) => api.put('/company', data),
};

export const clientsApi = {
  list: (params?: any) => api.get('/clients', { params }),
  get: (id: string) => api.get(`/clients/${id}`),
  create: (data: any) => api.post('/clients', data),
  update: (id: string, data: any) => api.patch(`/clients/${id}`, data),
  delete: (id: string) => api.delete(`/clients/${id}`),
  top: () => api.get('/clients/top'),
};

export const fournisseursApi = {
  list: (params?: any) => api.get('/fournisseurs', { params }),
  get: (id: string) => api.get(`/fournisseurs/${id}`),
  create: (data: any) => api.post('/fournisseurs', data),
  update: (id: string, data: any) => api.patch(`/fournisseurs/${id}`, data),
  delete: (id: string) => api.delete(`/fournisseurs/${id}`),
  categories: () => api.get('/fournisseurs/categories'),
};

export const projectsApi = {
  list: (params?: any) => api.get('/projects', { params }),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.patch(`/projects/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/projects/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/projects/${id}`),
  stats: () => api.get('/projects/stats'),
};

export const signaturesApi = {
  list: () => api.get('/signatures'),
  create: (data: any) => api.post('/signatures', data),
  setDefault: (id: string) => api.patch(`/signatures/${id}/default`),
  delete: (id: string) => api.delete(`/signatures/${id}`),
};

export const devisApi = {
  list: (params?: any) => api.get('/devis', { params }),
  get: (id: string) => api.get(`/devis/${id}`),
  create: (data: any) => api.post('/devis', data),
  update: (id: string, data: any) => api.patch(`/devis/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/devis/${id}/status`, { status }),
  duplicate: (id: string) => api.post(`/devis/${id}/duplicate`),
  delete: (id: string) => api.delete(`/devis/${id}`),
  restore: (id: string) => api.patch(`/devis/${id}/restore`),
  hardDelete: (id: string) => api.delete(`/devis/${id}/hard`),
  linesForBL: (id: string) => api.get(`/devis/${id}/lines-for-bl`),
  linesForInvoice: (id: string) => api.get(`/devis/${id}/lines-for-invoice`),
  stats: () => api.get('/devis/stats'),
};

export const bcApi = {
  list: (params?: any) => api.get('/bc', { params }),
  get: (id: string) => api.get(`/bc/${id}`),
  createFromDevis: (devisId: string, signatureId?: string) => api.post(`/bc/from-devis/${devisId}`, signatureId ? { signature_id: signatureId } : {}),
  update: (id: string, data: any) => api.patch(`/bc/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/bc/${id}/status`, { status }),
  cancel: (id: string) => api.delete(`/bc/${id}`),
  delete: (id: string) => api.delete(`/bc/${id}/permanent`),
  import: (data: any) => api.post('/bc/import', data),
};

export const blApi = {
  list: (params?: any) => api.get('/bl', { params }),
  get: (id: string) => api.get(`/bl/${id}`),
  create: (data: any) => api.post('/bl', data),
  createFromDevis: (devisId: string, signatureId?: string) => api.post(`/bl/from-devis/${devisId}`, signatureId ? { signature_id: signatureId } : {}),
  update: (id: string, data: any) => api.patch(`/bl/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/bl/${id}/status`, { status }),
  saveSignedScan: (id: string, signed_scan_url: string) => api.patch(`/bl/${id}/signed-scan`, { signed_scan_url }),
  delete: (id: string) => api.delete(`/bl/${id}`),
  restore: (id: string) => api.patch(`/bl/${id}/restore`),
  hardDelete: (id: string) => api.delete(`/bl/${id}/hard`),
};

export const invoicesApi = {
  list: (params?: any) => api.get('/invoices', { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  createFromBL: (data: any) => api.post('/invoices/from-bl', data),
  createPurchase: (data: any) => api.post('/invoices/purchase', data),
  pay: (id: string, data: any) => api.post(`/invoices/${id}/pay`, data),
  cancel: (id: string) => api.delete(`/invoices/${id}`),
  restore: (id: string) => api.patch(`/invoices/${id}/restore`),
  hardDelete: (id: string) => api.delete(`/invoices/${id}/hard`),
  updateStatus: (id: string, status: string) => api.patch(`/invoices/${id}/status`, { status }),
  updateScan: (id: string, scanned_file_url: string | null) =>
    api.patch(`/invoices/${id}/scan`, { scanned_file_url }),
  stats: (month?: number, year?: number) =>
    api.get('/invoices/stats', { params: { month, year } }),
};

export const uploadApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  extract: (filename: string) => api.get('/upload/extract', { params: { filename } }),
};

export const depensesApi = {
  list: (params?: any) => api.get('/depenses', { params }),
  findMine: (params?: any) => api.get('/depenses/my', { params }),
  create: (data: any) => api.post('/depenses', data),
  update: (id: string, data: any) => api.patch(`/depenses/${id}`, data),
  approve: (id: string) => api.patch(`/depenses/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch(`/depenses/${id}/reject`, { reason: reason || '' }),
  delete: (id: string) => api.delete(`/depenses/${id}`),
  stats: (params?: any) => api.get('/depenses/stats', { params }),
};


export const comptaApi = {
  invoiceStats: (year: number) => api.get('/invoices/stats', { params: { year } }),
  invoicesByMonth: (direction: string, year: number) =>
    api.get('/invoices', { params: { direction, year, page: 1 } }),
  depensesStats: (month?: number, year?: number) =>
    api.get('/depenses/stats', { params: { month, year } }),
  depensesByCategory: (year: number) =>
    api.get('/depenses/stats', { params: { year } }),
  rapprochementStatements: () => api.get('/rapprochement/statements'),
  rapprochementSummary: (id: string) => api.get(`/rapprochement/statements/${id}/summary`),
  rapprochementLines: (id: string, status?: string) =>
    api.get(`/rapprochement/statements/${id}/lines`, { params: { status } }),
};

export const dettesApi = {
  list:  (params?: any) => api.get('/dettes', { params }),
  stats: ()             => api.get('/dettes/stats'),
  get:   (id: string)   => api.get(`/dettes/${id}`),
  create:(data: any)    => api.post('/dettes', data),
  update:(id: string, data: any) => api.patch(`/dettes/${id}`, data),
  delete:(id: string)   => api.delete(`/dettes/${id}`),
  addPaiement:   (id: string, data: any) => api.post(`/dettes/${id}/paiements`, data),
  deletePaiement:(id: string, pid: string) => api.delete(`/dettes/${id}/paiements/${pid}`),
};

export const tasksApi = {
  list: (params?: any) => api.get('/tasks', { params }),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  updateStatus: (id: string, status: string, progress?: number) =>
    api.patch(`/tasks/${id}/status`, { status, progress }),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  stats: (params?: any) => api.get('/tasks/stats', { params }),
};

export const assignableUsersApi = {
  list: () => api.get('/users/assignable'),
};

export const pdfMergeApi = {
  merge: (items: { type: 'devis' | 'bl' | 'invoice' | 'bc'; id: string }[], lang?: string) =>
    api.post('/pdf/merge', { items, lang: lang || 'FR' }, { responseType: 'blob' }),
};
