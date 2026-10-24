function removeTrailingSlashes(value) {
  let result = value.trim();

  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

const API = removeTrailingSlashes(
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000/api'
);

export async function api(path, { token, ...options } = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  const headers = {
    'Content-Type': 'application/json',
    'X-Syntra-Auth-Mode': 'cookie',
    ...(options.headers || {})
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-Syntra-CSRF'] = '1';
  }

  // O cookie de sessão é enviado pelo navegador.
  // Não armazenamos o JWT no localStorage.
  let response;

  try {
    response = await fetch(`${NORMALIZED_API}${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include'
    });
  } catch {
    throw new Error(
      'Não foi possível conectar à API. Verifique se o backend está rodando.'
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }

  return data;
}