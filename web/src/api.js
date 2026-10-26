const API = (
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000/api'
).replace(/\/+$/, '');

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
    response = await fetch(`${API}${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include'
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
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

export async function streamChat(path, { token, signal, onToken, ...options } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'X-Syntra-Auth-Mode': 'cookie',
    ...(options.headers || {})
  };
  headers['X-Syntra-CSRF'] = '1';

  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      method: 'POST',
      headers,
      credentials: 'include',
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar à API. Verifique sua conexão.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('O navegador não suporta streaming nesta conexão.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData = {};
  let fullText = '';

  function processEvent(block) {
    let eventName = 'message';
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let payload;
    try { payload = JSON.parse(dataLines.join('\n')); }
    catch { return; }

    if (eventName === 'token' && typeof payload.token === 'string') {
      fullText += payload.token;
      onToken?.(payload.token, fullText);
    } else if (eventName === 'done') {
      finalData = payload;
    } else if (eventName === 'error') {
      throw new Error(payload.error || 'A geração falhou.');
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) processEvent(block);
      if (done) break;
    }
    if (buffer.trim()) processEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  return { ...finalData, message: { role: 'assistant', content: fullText } };
}
