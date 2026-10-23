const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
export async function api(path, { token, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o backend está rodando.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}
