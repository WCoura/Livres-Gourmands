export class ApiError extends Error {
  constructor(message, status, details = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  const token = auth ? localStorage.getItem('lg_token') : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('La librairie ne répond pas. Vérifiez votre connexion.', 0);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) localStorage.removeItem('lg_token');
    throw new ApiError(data.erreur || 'Une erreur est survenue.', response.status, data.details || []);
  }
  return data;
}
