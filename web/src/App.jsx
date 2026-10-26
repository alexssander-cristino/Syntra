
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, streamChat } from './api';
import CookieConsent from './CookieConsent';

import {
  Plus,
  MessageSquare,
  Settings,
  LogOut,
  Send,
  Copy,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  UserRound,
  LoaderCircle,
  Trash2,
  X,
  Check,
  AlertCircle,
  Sun,
  Moon,
  Code2,
  Lightbulb,
  BookOpen,
  PenLine,
  ShieldCheck,
  Download,
  UserX,
  Search,
  Pin,
  Archive,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Square,
  FileText,
  BarChart3
} from 'lucide-react';

const isMobile = () =>
  window.matchMedia('(max-width: 720px)').matches;

const SUGGESTIONS = [
  [
    Code2,
    'Escrever código',
    'Crie uma função JavaScript para ordenar uma lista.'
  ],
  [
    Lightbulb,
    'Explorar ideias',
    'Me ajude a desenvolver uma ideia de negócio.'
  ],
  [
    BookOpen,
    'Aprender algo',
    'Explique redes neurais de forma simples.'
  ],
  [
    PenLine,
    'Criar conteúdo',
    'Escreva uma apresentação curta e profissional.'
  ]
];

function AuthScreen({ onAuth, theme, onToggleTheme }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const data = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({
          ...(mode === 'register' ? { name: name.trim() } : {}),
          email: email.trim().toLowerCase(),
          password
        })
      });

      if (!data?.user) {
        throw new Error(
          'A API não retornou os dados da conta esperados.'
        );
      }

      // A autenticação web utiliza o cookie HttpOnly do servidor.
      // Não guardar JWT no localStorage.
      onAuth({ user: data.user });
    } catch (err) {
      setError(err.message || 'Não foi possível autenticar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page" data-theme={theme}>
      <button
        type="button"
        className="theme-toggle auth-theme-toggle"
        onClick={onToggleTheme}
        aria-label={
          theme === 'dark'
            ? 'Ativar tema claro'
            : 'Ativar tema escuro'
        }
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      >
        {theme === 'dark'
          ? <Sun size={18} />
          : <Moon size={18} />}
      </button>

      <div className="auth-glow" />

      <section className="auth-card">
        <div className="brand-mark large">
          <Sparkles size={25} />
        </div>

        <h1>
          Syntra<span>.</span>
        </h1>

        <p className="muted">
          {mode === 'login'
            ? 'Sua inteligência, no seu ritmo.'
            : 'Crie seu espaço de inteligência.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label>
              Nome

              <input
                value={name}
                onChange={e => setName(e.target.value)}
                minLength={2}
                maxLength={80}
                required
                autoComplete="name"
                placeholder="Como podemos te chamar?"
              />
            </label>
          )}

          <label>
            E-mail

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              maxLength={254}
              required
              autoComplete="email"
              placeholder="voce@exemplo.com"
            />
          </label>

          <label>
            Senha

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 12 : undefined}
              maxLength={128}
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
              placeholder={
                mode === 'register'
                  ? 'Mínimo de 12 caracteres'
                  : 'Sua senha'
              }
            />
          </label>

          {error && (
            <div className="error-box" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="primary full"
            disabled={busy}
          >
            {busy && (
              <LoaderCircle className="spin" size={18} />
            )}

            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login'
            ? 'Ainda não tem conta?'
            : 'Já tem uma conta?'}{' '}

          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode(current =>
                current === 'login' ? 'register' : 'login'
              );

              setError('');
              setPassword('');
            }}
          >
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>

        <p className="tiny muted">
          A IA é executada no servidor configurado pelo administrador.
        </p>

        <p className="tiny muted">
          Ao utilizar o Syntra, consulte nossos{' '}
          <a href="/terms.html">termos de uso</a> e nossa{' '}
          <a href="/privacy.html">política de privacidade</a>.
        </p>
      </section>
    </main>
  );
}

function SettingsModal({
  onClose,
  models,
  model,
  onModel,
  user,
  onLogout,
  onExportData,
  onDeleteAccount,
  onManageMemory,
  onManageDocuments,
  metrics,
  privacyBusy
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !privacyBusy) {
        onClose();
      }
    }

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, privacyBusy]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (
          e.target === e.currentTarget &&
          !privacyBusy
        ) {
          onClose();
        }
      }}
    >
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
      >
        <div className="modal-heading">
          <div>
            <h2>Configurações</h2>
            <p className="muted">
              Personalize sua experiência.
            </p>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
            disabled={privacyBusy}
          >
            <X />
          </button>
        </div>

        <label className="setting-label">
          Modelo de inteligência artificial

          <select
            value={model}
            onChange={e => onModel(e.target.value)}
          >
            {models.length === 0 && (
              <option value={model}>
                {model} (padrão)
              </option>
            )}

            {models.map(m => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <p className="tiny muted">
          Os modelos disponíveis dependem dos modelos instalados
          no Ollama no servidor.
        </p>

        <div className="account-row">
          <div className="avatar">
            <UserRound size={18} />
          </div>

          <div>
            <strong>{user?.name || 'Usuário'}</strong>
            <p className="muted tiny">
              {user?.email || ''}
            </p>
          </div>

          <button
            type="button"
            className="icon-button danger"
            onClick={onLogout}
            title="Sair"
            aria-label="Sair"
            disabled={privacyBusy}
          >
            <LogOut size={18} />
          </button>
        </div>

        <div className="privacy-settings">
          <button
            type="button"
            className="secondary full"
            onClick={onManageMemory}
            disabled={privacyBusy}
          >
            <Sparkles size={17} />
            Memória contextual
          </button>

          <button
            type="button"
            className="secondary full"
            onClick={onManageDocuments}
            disabled={privacyBusy}
          >
            <FileText size={17} />
            Documentos e contexto (RAG)
          </button>

          {metrics && (
            <div className="privacy-settings-heading">
              <BarChart3 size={19} />
              <div>
                <strong>Uso da sua conta</strong>
                <p className="tiny muted">
                  {metrics.conversations} conversas · {metrics.messages} mensagens · {metrics.documents} documentos
                </p>
                <p className="tiny muted">
                  Avaliações positivas: {metrics.positive_ratings} · negativas: {metrics.negative_ratings}
                </p>
                <p className="tiny muted">
                  Tempo médio medido: {metrics.average_generation_ms == null ? 'sem dados ainda' : `${(metrics.average_generation_ms / 1000).toFixed(1)} s`} · tokens de saída estimados: {metrics.estimated_output_tokens}
                </p>
              </div>
            </div>
          )}

          <div className="privacy-settings-heading">
            <ShieldCheck size={19} />

            <div>
              <strong>Privacidade e seus dados</strong>

              <p className="tiny muted">
                Consulte, exporte ou exclua os dados da sua conta.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="secondary full"
            onClick={onExportData}
            disabled={privacyBusy}
          >
            {privacyBusy
              ? <LoaderCircle size={17} className="spin" />
              : <Download size={17} />}

            Exportar meus dados
          </button>

          <button
            type="button"
            className="secondary full privacy-delete-button"
            onClick={onDeleteAccount}
            disabled={privacyBusy}
          >
            <UserX size={17} />
            Excluir minha conta e conversas
          </button>

          <p className="tiny muted">
            A exclusão é permanente. Cópias em backups ou registros
            sujeitos a retenção legal podem ter prazos próprios.
          </p>

          <div className="privacy-links">
            <a href="/privacy.html" target="_blank" rel="noreferrer">
              Política de privacidade
            </a>

            <a href="/cookies.html" target="_blank" rel="noreferrer">
              Política de cookies
            </a>

            <a href="/terms.html" target="_blank" rel="noreferrer">
              Termos de uso
            </a>
          </div>
        </div>

        <button
          type="button"
          className="secondary full"
          onClick={onClose}
          disabled={privacyBusy}
        >
          Concluído
        </button>
      </section>
    </div>
  );
}

function Message({
  message,
  onCopy,
  onRegenerate,
  onEdit,
  onFeedback,
  last,
  busy
}) {
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await onCopy(message.content);
      setCopied(true);

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch (error) {
      console.error(
        'Não foi possível copiar a mensagem:',
        error
      );
    }
  }

  return (
    <div
      className={`message-row ${isAssistant ? 'assistant' : 'user'}`}
    >
      <div className={`message-avatar ${isAssistant ? 'ai' : ''}`}>
        {isAssistant
          ? <Sparkles size={17} />
          : <UserRound size={17} />}
      </div>

      <div className="message-body">
        <div className="message-author">
          {isAssistant ? 'Syntra' : 'Você'}
        </div>

        <div className="markdown">
          {message.pending ? (
            <div
              className="typing"
              role="status"
              aria-label="O Syntra está respondendo"
            >
              <i />
              <i />
              <i />
            </div>
          ) : isAssistant ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ),
                pre: ({ node, ...props }) => (
                  <pre {...props} />
                ),
                code: ({
                  node,
                  inline,
                  className,
                  children,
                  ...props
                }) =>
                  inline ? (
                    <code className="inline-code" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
              }}
            >
              {message.content || ''}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
        </div>

        {!message.pending && (
          <div className="message-actions">
            {isAssistant ? (
              <>
                <button type="button" onClick={() => { void handleCopy(); }} title="Copiar resposta">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
                <button type="button" onClick={() => void onFeedback(message, 1)} disabled={busy} aria-pressed={message.rating === 1} title="Resposta útil">
                  <ThumbsUp size={14} /> Útil
                </button>
                <button type="button" onClick={() => void onFeedback(message, -1)} disabled={busy} aria-pressed={message.rating === -1} title="Resposta não útil">
                  <ThumbsDown size={14} /> Não útil
                </button>
                {last && (
                  <button type="button" onClick={() => void onRegenerate()} disabled={busy} title="Regenerar resposta">
                    <RotateCcw size={14} /> Regenerar
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => onEdit(message)} disabled={busy || !message.id} title="Editar mensagem">
                <Pencil size={14} /> Editar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryModal({ memories, onClose, onAdd, onDelete, onClear, busy, draft, onDraft }) {
  const [error, setError] = useState('');

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await onAdd();
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a memória.');
    }
  }

  async function remove(id) {
    if (!window.confirm('Excluir esta memória?')) return;
    setError('');
    try {
      await onDelete(id);
    } catch (err) {
      setError(err.message || 'Não foi possível excluir a memória.');
    }
  }

  async function clearAll() {
    if (!memories.length || !window.confirm('Apagar todas as memórias salvas?')) return;
    setError('');
    try {
      await onClear();
    } catch (err) {
      setError(err.message || 'Não foi possível apagar as memórias.');
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => {
      if (e.target === e.currentTarget && !busy) onClose();
    }}>
      <section className="settings-modal memory-modal" role="dialog" aria-modal="true" aria-label="Memória contextual">
        <div className="modal-heading">
          <div>
            <h2>Memória contextual</h2>
            <p className="muted">O Syntra usa estas informações para personalizar respostas futuras.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar"><X /></button>
        </div>

        <form className="memory-add-form" onSubmit={add}>
          <label className="setting-label">
            Adicionar memória
            <textarea value={draft} onChange={e => onDraft(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: Prefiro respostas em português e objetivas." disabled={busy} />
          </label>
          <button type="submit" className="primary full" disabled={busy || draft.trim().length < 2}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}
            Salvar memória
          </button>
        </form>

        {error && <div className="error-box" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}

        <div className="memory-list-heading">
          <strong>Memórias salvas ({memories.length})</strong>
          {memories.length > 0 && <button type="button" className="text-button danger-text" onClick={() => void clearAll()} disabled={busy}>Apagar todas</button>}
        </div>

        <div className="memory-list">
          {memories.length === 0 ? (
            <p className="muted">Nenhuma memória salva. Você também pode pedir ao Syntra para lembrar uma preferência ou informação importante.</p>
          ) : memories.map(memory => (
            <article className="memory-item" key={memory.id}>
              <div>
                <p>{memory.content}</p>
                <small className="muted">{memory.source === 'auto' ? 'Salva automaticamente' : 'Adicionada por você'}</small>
              </div>
              <button type="button" className="icon-button danger" aria-label="Excluir memória" title="Excluir memória" disabled={busy} onClick={() => void remove(memory.id)}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>

        <p className="tiny muted">Não salve senhas, tokens, credenciais ou dados pessoais sensíveis. Memórias ficam vinculadas à sua conta e podem ser apagadas a qualquer momento.</p>
        <button type="button" className="secondary full" onClick={onClose} disabled={busy}>Concluído</button>
      </section>
    </div>
  );
}



function DocumentsModal({ documents, metrics, onClose, onUpload, onDelete, busy }) {
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function selectFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(txt|md|csv|json|log)$/i.test(file.name)) {
      setError('Por enquanto, envie arquivos TXT, MD, CSV, JSON ou LOG.');
      return;
    }
    if (file.size > 100 * 1024) {
      setError('O arquivo deve ter no máximo 100 KB.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const content = await file.text();
      await onUpload(file.name, content);
    } catch (err) {
      setError(err.message || 'Não foi possível importar o arquivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => {
      if (e.target === e.currentTarget && !busy && !uploading) onClose();
    }}>
      <section className="settings-modal memory-modal" role="dialog" aria-modal="true" aria-label="Documentos para contexto">
        <div className="modal-heading">
          <div>
            <h2>Documentos e contexto</h2>
            <p className="muted">O Syntra procura trechos relevantes dos seus documentos para fundamentar as respostas.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy || uploading} aria-label="Fechar"><X /></button>
        </div>

        <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.log,text/plain,text/markdown,application/json" hidden onChange={selectFile} />
        <button type="button" className="primary full" onClick={() => fileRef.current?.click()} disabled={busy || uploading}>
          {uploading ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}
          Importar documento de texto
        </button>
        <p className="tiny muted">Formatos: TXT, MD, CSV, JSON e LOG · até 100 KB por arquivo · até 50 documentos. Não envie senhas ou dados sensíveis.</p>

        {error && <div className="error-box" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}

        <div className="memory-list-heading"><strong>Seus documentos ({documents.length})</strong></div>
        <div className="memory-list">
          {documents.length === 0 ? <p className="muted">Nenhum documento importado.</p> : documents.map(doc => (
            <article className="memory-item" key={doc.id}>
              <div>
                <p>{doc.filename}</p>
                <small className="muted">{doc.characters} caracteres · {new Date(doc.created_at).toLocaleDateString()}</small>
              </div>
              <button type="button" className="icon-button danger" aria-label="Excluir documento" title="Excluir documento" disabled={busy || uploading} onClick={() => void onDelete(doc.id)}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
        {metrics && <p className="tiny muted">Uso registrado: {metrics.messages} mensagens e {metrics.conversations} conversas.</p>}
        <button type="button" className="secondary full" onClick={onClose} disabled={busy || uploading}>Concluído</button>
      </section>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('syntra-theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = useCallback(() => {
    setTheme(current =>
      current === 'dark' ? 'light' : 'dark'
    );
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('syntra-theme', theme);
    } catch {
      // O tema permanece funcional mesmo sem armazenamento local.
    }

    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const [conversations, setConversations] = useState([]);
  const [visibleConversations, setVisibleConversations] = useState([]);
  const [conversationSearch, setConversationSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState('qwen3:4b');
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const activeRequestRef = useRef(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [documentsBusy, setDocumentsBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const newChatRef = useRef(null);

  // Compatibilidade com chamadas existentes.
  // O api.js usa credentials: include e não envia esse valor como JWT.
  const token = auth ? 'cookie-session' : null;

  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeId),
    [conversations, activeId]
  );

  const clearAccountData = useCallback(() => {
    setAuth(null);
    setConversations([]);
    setVisibleConversations([]);
    setConversationSearch('');
    setShowArchived(false);
    setMessages([]);
    setActiveId(null);
    setDraft('');
    setSettingsOpen(false);
    setError('');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({})
      });
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err);
    } finally {
      clearAccountData();
      setPrivacyBusy(false);
    }
  }, [clearAccountData]);

  // Recupera a sessão do cookie HttpOnly.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const data = await api('/auth/me');

        if (cancelled) return;

        if (!data?.user) {
          throw new Error('Sessão inválida.');
        }

        setAuth({ user: data.user });
      } catch {
        if (!cancelled) {
          setAuth(null);
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Pesquisa e filtro de conversas são executados no backend.
  useEffect(() => {
    if (!token) {
      setVisibleConversations([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (conversationSearch.trim()) params.set('q', conversationSearch.trim());
        if (showArchived) params.set('archived', 'true');
        const suffix = params.toString();
        const data = await api(`/conversations${suffix ? `?${suffix}` : ''}`, {
        });
        if (!cancelled) setVisibleConversations(data.conversations || []);
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          setError(err.message || 'Não foi possível pesquisar conversas.');
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, conversationSearch, showArchived, conversations]);

  // Carrega conversas e modelos após autenticar.
  useEffect(() => {
    if (!token) {
      setConversations([]);
      setVisibleConversations([]);
      setModels([]);
      setActiveId(null);
      setMessages([]);
      return undefined;
    }

    let cancelled = false;

    async function loadInitialData() {
      try {
        const [convData, modelData] = await Promise.all([
          api('/conversations'),
          api('/chat/models').catch(() => ({
            models: [],
            defaultModel: 'qwen3:4b'
          }))
        ]);

        if (cancelled) return;

        const conversationList = convData.conversations || [];
        const availableModels = modelData.models || [];

        setConversations(conversationList);
        setModels(availableModels);

        setModel(current => {
          if (availableModels.some(m => m.name === current)) {
            return current;
          }

          return (
            availableModels[0]?.name ||
            modelData.defaultModel ||
            'qwen3:4b'
          );
        });

        setActiveId(current => (
          current &&
          conversationList.some(c => c.id === current)
            ? current
            : conversationList[0]?.id || null
        ));
      } catch (err) {
        if (!cancelled) {
          if (
            /sessão inválida|entre novamente|faça login/i.test(
              err.message
            )
          ) {
            clearAccountData();
          } else {
            setError(err.message);
          }
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [token, clearAccountData]);

  useEffect(() => {
    if (!token || !activeId) {
      setMessages([]);
      setLoadingMessages(false);
      return undefined;
    }

    let cancelled = false;

    async function loadMessages() {
      setLoadingMessages(true);

      try {
        const data = await api(
          `/conversations/${encodeURIComponent(activeId)}/messages`
        );

        if (!cancelled) {
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [token, activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    });
  }, [messages, busy]);

  useEffect(() => {
    if (!toast) return undefined;

    const id = setTimeout(() => setToast(''), 2200);

    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const el = inputRef.current;

    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  useEffect(() => {
    if (!token) return undefined;

    function onKey(e) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault();
        newChatRef.current?.();
      }
    }

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [token]);

  async function createConversation() {
    if (!token) return;

    setError('');

    try {
      const data = await api('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Nova conversa',
          model
        })
      });

      setConversations(old => [
        data.conversation,
        ...old.filter(c => c.id !== data.conversation.id)
      ]);

      setActiveId(data.conversation.id);
      setMessages([]);
      setDraft('');

      if (isMobile()) {
        setSidebarOpen(false);
      }

      inputRef.current?.focus();
    } catch (err) {
      setError(err.message);
    }
  }

  newChatRef.current = () => {
    void createConversation();
  };

  async function refreshConversations() {
    const data = await api('/conversations');
    setConversations(data.conversations || []);
  }

  async function organizeConversation(id, patch) {
    try {
      const data = await api(`/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setConversations(old => old.map(c => c.id === id ? { ...c, ...data.conversation } : c));
      setToast(patch.title ? 'Conversa renomeada' : patch.is_pinned !== undefined ? (patch.is_pinned ? 'Conversa fixada' : 'Conversa desafixada') : (patch.archived ? 'Conversa arquivada' : 'Conversa restaurada'));
      if (patch.archived === true && activeId === id) {
        const remaining = conversations.find(c => c.id !== id && !c.archived_at);
        setActiveId(remaining?.id || null);
        setMessages([]);
      }
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar a conversa.');
    }
  }

  function renameConversation(e, conversation) {
    e.stopPropagation();
    const title = window.prompt('Novo título da conversa:', conversation.title || 'Nova conversa');
    if (title === null) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('O título não pode ficar vazio.');
      return;
    }
    if (cleanTitle.length > 120) {
      setError('O título deve ter no máximo 120 caracteres.');
      return;
    }
    void organizeConversation(conversation.id, { title: cleanTitle });
  }

  async function sendMessage(textOverride) {
    const text = (textOverride ?? draft).trim();

    if (!text || busy || !token) return;

    setError('');
    setBusy(true);
    setDraft('');
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const previousMessages = messages;

    if (editingMessageId && activeId) {
      try {
        await api(`/chat/conversations/${encodeURIComponent(activeId)}/edit`, {
          method: 'POST',
          body: JSON.stringify({ messageId: editingMessageId, content: text }),
          signal: controller.signal
        });
        const refreshed = await api(`/conversations/${encodeURIComponent(activeId)}/messages`);
        setMessages(refreshed.messages || []);
        setEditingMessageId(null);
        await refreshConversations();
      } catch (err) {
        if (err.name === 'AbortError') {
          setDraft(text);
          setToast('Geração interrompida');
        } else {
          setError(err.message);
          setDraft(text);
        }
        try {
          const refreshed = await api(`/conversations/${encodeURIComponent(activeId)}/messages`);
          setMessages(refreshed.messages || []);
        } catch (reloadError) {
          console.error('Não foi possível recarregar as mensagens:', reloadError);
        }
      } finally {
        activeRequestRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
      }
      return;
    }

    let conversationId = activeId;

    try {
      if (!conversationId) {
        const created = await api('/conversations', {
          method: 'POST',
          body: JSON.stringify({
            title: text.slice(0, 60),
            model
          })
        });

        conversationId = created.conversation.id;
        setActiveId(conversationId);

        setConversations(old => [
          created.conversation,
          ...old.filter(c => c.id !== created.conversation.id)
        ]);
      }

      setMessages([
        ...previousMessages,
        { role: 'user', content: text },
        { role: 'assistant', content: '', pending: true }
      ]);

      await streamChat('/chat/stream', {
        body: JSON.stringify({
          conversationId,
          message: text,
          model: activeConversation?.model || model
        }),
        signal: controller.signal,
        onToken: (_token, fullText) => {
          setMessages(current => {
            const next = [...current];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && next[lastIndex].pending) {
              next[lastIndex] = { ...next[lastIndex], content: fullText };
            }
            return next;
          });
        }
      });

      const refreshed = await api(`/conversations/${encodeURIComponent(conversationId)}/messages`);
      setMessages(refreshed.messages || []);
      await refreshConversations();
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(previousMessages);
        setDraft(text);
        setToast('Geração interrompida');
      } else {
        setMessages(previousMessages);
        setError(err.message);
        setDraft(text);
      }
    } finally {
      activeRequestRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function stopGeneration() {
    activeRequestRef.current?.abort();
  }

  function editMessage(message) {
    if (busy || !message?.id) return;
    setEditingMessageId(String(message.id));
    setDraft(message.content || '');
    inputRef.current?.focus();
  }

  async function rateMessage(message, rating) {
    if (!activeId || !message?.id || busy) return;
    const previousRating = message.rating ?? null;
    const nextRating = previousRating === rating ? null : rating;
    try {
      if (nextRating === null) {
        // The API accepts only +/-1, so clicking the selected vote keeps it selected.
        return;
      }
      await api(`/conversations/${encodeURIComponent(activeId)}/messages/${encodeURIComponent(message.id)}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating: nextRating })
      });
      setMessages(old => old.map(m => String(m.id) === String(message.id) ? { ...m, rating: nextRating } : m));
      setToast(nextRating === 1 ? 'Feedback positivo registrado' : 'Feedback negativo registrado');
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a avaliação.');
    }
  }

  async function regenerate() {
    if (!activeId || busy || !token) return;

    setBusy(true);
    setError('');
    const controller = new AbortController();
    activeRequestRef.current = controller;

    try {
      const data = await api(
        `/chat/conversations/${encodeURIComponent(activeId)}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          signal: controller.signal
        }
      );

      const refreshed = await api(`/conversations/${encodeURIComponent(activeId)}/messages`);
      setMessages(refreshed.messages || []);
      await refreshConversations();
    } catch (err) {
      if (err.name === 'AbortError') {
        setToast('Geração interrompida');
      } else {
        setError(err.message);
      }
      try {
        const data = await api(
          `/conversations/${encodeURIComponent(activeId)}/messages`
        );
        setMessages(data.messages || []);
      } catch (reloadError) {
        console.error('Não foi possível recarregar as mensagens:', reloadError);
      }
    } finally {
      activeRequestRef.current = null;
      setBusy(false);
    }
  }

  async function deleteConversation(e, id) {
    e.stopPropagation();

    if (!window.confirm('Excluir esta conversa permanentemente?')) {
      return;
    }

    try {
      await api(
        `/conversations/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );

      const remaining = conversations.filter(c => c.id !== id);

      setConversations(remaining);

      if (activeId === id) {
        setActiveId(remaining[0]?.id || null);
        setMessages([]);
      }

      setToast('Conversa excluída');
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Resposta copiada');
    } catch {
      setToast('Não foi possível copiar automaticamente');
      throw new Error('Não foi possível copiar a resposta.');
    }
  }

  async function changeModel(value) {
    const previousModel = model;
    setModel(value);

    if (!activeId) return;

    try {
      await api(
        `/conversations/${encodeURIComponent(activeId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ model: value })
        }
      );

      setConversations(old =>
        old.map(c =>
          c.id === activeId ? { ...c, model: value } : c
        )
      );
    } catch (err) {
      setModel(previousModel);
      setError(err.message);
    }
  }

  async function openDocumentsManager() {
    setSettingsOpen(false);
    setDocumentsOpen(true);
    setDocumentsBusy(true);
    try {
      const [docsData, metricsData] = await Promise.all([
        api('/documents'),
        api('/metrics')
      ]);
      setDocuments(docsData.documents || []);
      setMetrics(metricsData.metrics || null);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar documentos e métricas.');
    } finally {
      setDocumentsBusy(false);
    }
  }

  async function uploadDocument(filename, content) {
    setDocumentsBusy(true);
    try {
      const data = await api('/documents', {
        method: 'POST',
        body: JSON.stringify({ filename, content })
      });
      setDocuments(old => [data.document, ...old.filter(item => item.id !== data.document.id)]);
      const metricData = await api('/metrics').catch(() => null);
      if (metricData?.metrics) setMetrics(metricData.metrics);
      setToast('Documento importado para contexto');
    } finally {
      setDocumentsBusy(false);
    }
  }

  async function deleteDocument(id) {
    setDocumentsBusy(true);
    try {
      await api(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDocuments(old => old.filter(item => item.id !== id));
      const metricData = await api('/metrics').catch(() => null);
      if (metricData?.metrics) setMetrics(metricData.metrics);
    } finally {
      setDocumentsBusy(false);
    }
  }

  async function loadMemories() {
    const data = await api('/memory');
    setMemories(data.memories || []);
  }

  async function openMemoryManager() {
    setSettingsOpen(false);
    setMemoryOpen(true);
    try {
      await loadMemories();
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as memórias.');
    }
  }

  async function addMemory() {
    const content = memoryDraft.trim();
    if (content.length < 2) throw new Error('Escreva uma memória com pelo menos 2 caracteres.');
    setMemoryBusy(true);
    try {
      const data = await api('/memory', {
        method: 'POST',
        body: JSON.stringify({ content })
      });
      setMemories(old => [data.memory, ...old.filter(item => item.id !== data.memory.id)]);
      setMemoryDraft('');
    } finally {
      setMemoryBusy(false);
    }
  }

  async function deleteMemory(id) {
    setMemoryBusy(true);
    try {
      await api(`/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setMemories(old => old.filter(item => item.id !== id));
    } finally {
      setMemoryBusy(false);
    }
  }

  async function clearMemories() {
    setMemoryBusy(true);
    try {
      await api('/memory', { method: 'DELETE' });
      setMemories([]);
    } finally {
      setMemoryBusy(false);
    }
  }

  async function exportMyData() {
    if (privacyBusy) return;

    setPrivacyBusy(true);
    setError('');

    try {
      const data = await api('/privacy/export');

      const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json;charset=utf-8' }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'syntra-meus-dados.json';
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast('Exportação dos dados iniciada');
    } catch (err) {
      setError(err.message || 'Não foi possível exportar os dados.');
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function deleteMyAccount() {
    if (privacyBusy) return;

    const firstConfirmation = window.confirm(
      'ATENÇÃO: excluir sua conta apagará sua conta e suas conversas. ' +
      'Esta ação não pode ser desfeita. Deseja continuar?'
    );

    if (!firstConfirmation) return;

    const confirmation = window.prompt(
      'Para confirmar a exclusão permanente, digite exatamente:\n\n' +
      'EXCLUIR MINHA CONTA'
    );

    if (confirmation !== 'EXCLUIR MINHA CONTA') {
      setToast('Exclusão cancelada');
      return;
    }

    setPrivacyBusy(true);
    setError('');

    try {
      await api('/privacy/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation })
      });

      clearAccountData();
      setToast('Conta excluída');
    } catch (err) {
      setError(err.message || 'Não foi possível excluir a conta.');
    } finally {
      setPrivacyBusy(false);
    }
  }

  if (authChecking) {
    return (
      <main className="auth-page" data-theme={theme}>
        <section className="auth-card">
          <div className="brand-mark large">
            <Sparkles size={25} />
          </div>

          <h1>
            Syntra<span>.</span>
          </h1>

          <div
            className="center-state"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="spin" size={24} />
            <span>Verificando sessão...</span>
          </div>
        </section>

        <CookieConsent />
      </main>
    );
  }

  if (!auth?.user) {
    return (
      <>
        <AuthScreen
          theme={theme}
          onToggleTheme={toggleTheme}
          onAuth={data => {
            if (data?.user) {
              setError('');
              setAuth({ user: data.user });
            }
          }}
        />

        {error && (
          <div className="toast" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <CookieConsent />
      </>
    );
  }

  const firstName = auth.user.name?.split(' ')[0] || '';

  return (
    <div className="app-shell" data-theme={theme}>
      {sidebarOpen && (
        <div
          className="scrim"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}
      >
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => {
              setActiveId(null);
              setMessages([]);
              setError('');

              if (isMobile()) {
                setSidebarOpen(false);
              }
            }}
          >
            <span className="brand-mark">
              <Sparkles size={19} />
            </span>

            <span>
              syntra<span className="brand-dot">.</span>
            </span>
          </button>

          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={() => void createConversation()}
        >
          <Plus size={17} />
          Nova conversa
          <span>Ctrl K</span>
        </button>

        <div className="conversation-tools">
          <label className="conversation-search">
            <Search size={16} />
            <input
              type="search"
              value={conversationSearch}
              onChange={e => setConversationSearch(e.target.value)}
              placeholder="Pesquisar conversas..."
              aria-label="Pesquisar conversas por título ou mensagem"
              maxLength={120}
            />
            {conversationSearch && (
              <button type="button" aria-label="Limpar pesquisa" onClick={() => setConversationSearch('')}>
                <X size={14} />
              </button>
            )}
          </label>
          <button
            type="button"
            className={`archive-toggle ${showArchived ? 'active' : ''}`}
            onClick={() => setShowArchived(value => !value)}
          >
            <Archive size={15} />
            {showArchived ? 'Ver recentes' : 'Arquivadas'}
          </button>
        </div>

        <div className="side-section-label">{showArchived ? 'Arquivadas' : 'Conversas'}</div>

        <nav className="conversation-list" aria-label={showArchived ? 'Conversas arquivadas' : 'Conversas'}>
          {visibleConversations.map(c => (
            <button
              type="button"
              key={c.id}
              className={`conversation-item ${activeId === c.id ? 'selected' : ''}`}
              onClick={() => {
                setActiveId(c.id);
                setError('');
                if (isMobile()) setSidebarOpen(false);
              }}
            >
              {c.is_pinned && <Pin size={13} className="pinned-indicator" />}
              <MessageSquare size={16} />
              <span className="conversation-title">{c.title || 'Nova conversa'}</span>
              <span className="conversation-actions">
                <span className="delete-conv" role="button" tabIndex={0}
                  aria-label={c.is_pinned ? 'Desafixar conversa' : 'Fixar conversa'}
                  title={c.is_pinned ? 'Desafixar' : 'Fixar'}
                  onClick={e => { e.stopPropagation(); void organizeConversation(c.id, { is_pinned: !c.is_pinned }); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void organizeConversation(c.id, { is_pinned: !c.is_pinned }); } }}>
                  <Pin size={13} />
                </span>
                <span className="delete-conv" role="button" tabIndex={0}
                  aria-label="Renomear conversa" title="Renomear"
                  onClick={e => renameConversation(e, c)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renameConversation(e, c); } }}>
                  <Pencil size={13} />
                </span>
                <span className="delete-conv" role="button" tabIndex={0}
                  aria-label={showArchived ? 'Restaurar conversa' : 'Arquivar conversa'}
                  title={showArchived ? 'Restaurar' : 'Arquivar'}
                  onClick={e => { e.stopPropagation(); void organizeConversation(c.id, { archived: !showArchived }); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void organizeConversation(c.id, { archived: !showArchived }); } }}>
                  <Archive size={13} />
                </span>
                <span className="delete-conv" role="button" tabIndex={0}
                  aria-label={`Excluir conversa ${c.title || ''}`} title="Excluir"
                  onClick={e => void deleteConversation(e, c.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void deleteConversation(e, c.id); } }}>
                  <Trash2 size={14} />
                </span>
              </span>
            </button>
          ))}
          {!visibleConversations.length && (
            <p className="tiny muted side-empty">
              {conversationSearch.trim()
                ? 'Nenhuma conversa encontrada.'
                : showArchived ? 'Nenhuma conversa arquivada.' : 'Suas conversas aparecerão aqui.'}
            </p>
          )}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="side-action"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
            Configurações
          </button>

          <div className="profile">
            <div className="avatar">
              <UserRound size={17} />
            </div>

            <div className="profile-info">
              <strong>{auth.user.name}</strong>
              <span>{auth.user.email}</span>
            </div>

            <button
              type="button"
              className="icon-button"
              onClick={() => void logout()}
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button
            type="button"
            className="icon-button"
            onClick={() => setSidebarOpen(open => !open)}
            aria-label="Alternar menu"
          >
            {sidebarOpen
              ? <PanelLeftClose size={19} />
              : <PanelLeftOpen size={19} />}
          </button>

          <div className="topbar-model">
            <span className="status-dot" />
            {activeConversation?.model || model}
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark'
                ? 'Ativar tema claro'
                : 'Ativar tema escuro'
            }
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {theme === 'dark'
              ? <Sun size={18} />
              : <Moon size={18} />}
          </button>

          <button
            type="button"
            className="icon-button settings-shortcut"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações"
          >
            <Settings size={18} />
          </button>
        </header>

        <section
          className={`chat-scroll ${
            messages.length ? 'has-messages' : ''
          }`}
        >
          {loadingMessages ? (
            <div className="center-state">
              <LoaderCircle className="spin" size={24} />
              <span>Carregando conversa...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">
                <Sparkles size={26} />
              </div>

              <p className="eyebrow">
                {firstName
                  ? `Olá, ${firstName}`
                  : 'Seu assistente pessoal'}
              </p>

              <h1>
                O que vamos <span>criar</span> hoje?
              </h1>

              <p className="welcome-copy">
                Pergunte, explore ideias ou resolva algo complexo.
                Vamos começar.
              </p>

              <div className="suggestion-grid">
                {SUGGESTIONS.map(([Icon, label, prompt]) => (
                  <button
                    type="button"
                    key={label}
                    className="suggestion"
                    onClick={() => void sendMessage(prompt)}
                    disabled={busy}
                  >
                    <span className="suggestion-icon">
                      <Icon size={17} />
                    </span>

                    <span>
                      <strong>{label}</strong>
                      <small>{prompt}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-container" aria-live="polite">
              {messages.map((m, i) => (
                <Message
                  key={m.id || `${i}-${m.role}`}
                  message={m}
                  onCopy={copyText}
                  onRegenerate={regenerate}
                  onEdit={editMessage}
                  onFeedback={rateMessage}
                  last={
                    i === messages.length - 1 &&
                    m.role === 'assistant' &&
                    !m.pending
                  }
                  busy={busy}
                />
              ))}

              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composer-wrap">
          {error && (
            <div className="inline-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>

              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Fechar aviso"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <form
            className="composer"
            onSubmit={e => {
              e.preventDefault();
              void sendMessage();
            }}
          >
            {editingMessageId && (
              <div className="editing-banner">
                <span>Editando mensagem anterior</span>
                <button type="button" onClick={() => { setEditingMessageId(null); setDraft(''); }} disabled={busy}>Cancelar edição</button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={editingMessageId ? "Edite sua mensagem..." : "Envie uma mensagem ao Syntra..."}
              rows={1}
              maxLength={12000}
              disabled={busy}
              aria-label="Mensagem"
            />

            <div className="composer-footer">
              <span className={busy ? "composer-hint generation-status" : "composer-hint"} role={busy ? "status" : undefined}>
                {busy ? "Syntra está respondendo..." : "Enter para enviar · Shift + Enter para nova linha"}
              </span>

              {busy ? (
                <button type="button" className="send-button stop-button" onClick={stopGeneration} aria-label="Interromper geração" title="Interromper geração">
                  <Square size={15} />
                </button>
              ) : (
                <button type="submit" className="send-button" disabled={!draft.trim()} aria-label={editingMessageId ? "Salvar edição e regenerar" : "Enviar mensagem"}>
                  {editingMessageId ? <Check size={17} /> : <Send size={17} />}
                </button>
              )}
            </div>
          </form>

          <p className="disclaimer">
            O Syntra pode cometer erros. Confira informações importantes.
          </p>
        </div>
      </main>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          models={models}
          model={activeConversation?.model || model}
          onModel={changeModel}
          user={auth.user}
          onLogout={() => void logout()}
          onExportData={() => void exportMyData()}
          onDeleteAccount={() => void deleteMyAccount()}
          onManageMemory={() => void openMemoryManager()}
          onManageDocuments={() => void openDocumentsManager()}
          metrics={metrics}
          privacyBusy={privacyBusy}
        />
      )}

      {documentsOpen && (
        <DocumentsModal
          documents={documents}
          metrics={metrics}
          onClose={() => setDocumentsOpen(false)}
          onUpload={uploadDocument}
          onDelete={deleteDocument}
          busy={documentsBusy}
        />
      )}

      {memoryOpen && (
        <MemoryModal
          memories={memories}
          onClose={() => setMemoryOpen(false)}
          onAdd={addMemory}
          onDelete={deleteMemory}
          onClear={clearMemories}
          busy={memoryBusy}
          draft={memoryDraft}
          onDraft={setMemoryDraft}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}

      <CookieConsent />
    </div>
  );
}
