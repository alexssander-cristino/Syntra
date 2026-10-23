import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from './api';
import {
  Plus, MessageSquare, Settings, LogOut, Send, Copy, RotateCcw,
  PanelLeftClose, PanelLeftOpen, Sparkles, Bot, UserRound, LoaderCircle,
  Trash2, X, Check, Cpu, Menu, AlertCircle, Sun, Moon
} from 'lucide-react';

function AuthScreen({ onAuth, theme, onToggleTheme }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ name, email, password }) });
      onAuth(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="auth-page" data-theme={theme}>
    <button className="theme-toggle auth-theme-toggle" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
    <div className="auth-glow" />
    <section className="auth-card">
      <div className="brand-mark large"><Sparkles size={25} /></div>
      <h1>Syntra<span>.</span></h1>
      <p className="muted">{mode === 'login' ? 'Sua inteligência, no seu ritmo.' : 'Crie seu espaço de inteligência.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label>Nome<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={80} required placeholder="Como podemos te chamar?" /></label>}
        <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="voce@exemplo.com" /></label>
        <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo de 8 caracteres" /></label>
        {error && <div className="error-box"><AlertCircle size={16}/>{error}</div>}
        <button className="primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : null}{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      </form>
      <p className="auth-switch">{mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'} <button className="text-button" onClick={()=>{setMode(mode === 'login' ? 'register' : 'login');setError('')}}>{mode === 'login' ? 'Criar conta' : 'Entrar'}</button></p>
      <p className="tiny muted">A IA é executada no servidor configurado pelo administrador.</p>
    </section>
  </main>;
}

function SettingsModal({ onClose, models, model, onModel, user, onLogout }) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="settings-modal">
      <div className="modal-heading"><div><h2>Configurações</h2><p className="muted">Personalize sua experiência.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></div>
      <label className="setting-label">Modelo de inteligência artificial
        <select value={model} onChange={e=>onModel(e.target.value)}>
          {models.length === 0 && <option value={model}>{model} (padrão)</option>}
          {models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
      </label>
      <p className="tiny muted">Os modelos disponíveis dependem dos modelos instalados no Ollama no servidor.</p>
      <div className="account-row"><div className="avatar"><UserRound size={18}/></div><div><strong>{user.name}</strong><p className="muted tiny">{user.email}</p></div><button className="icon-button danger" onClick={onLogout} title="Sair"><LogOut size={18}/></button></div>
      <button className="secondary full" onClick={onClose}>Concluído</button>
    </section>
  </div>;
}

function Message({ message, onCopy, onRegenerate, last, busy }) {
  const isAssistant = message.role === 'assistant';
  return <div className={`message-row ${isAssistant ? 'assistant' : 'user'}`}>
    <div className={`message-avatar ${isAssistant ? 'ai' : ''}`}>{isAssistant ? <Sparkles size={17}/> : <UserRound size={17}/>}</div>
    <div className="message-body">
      <div className="message-author">{isAssistant ? 'Syntra' : 'Você'}</div>
      <div className="markdown">
        {isAssistant ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: ({node, ...props}) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: ({node, ...props}) => <pre {...props} />,
          code: ({node, inline, className, children, ...props}) => inline
            ? <code className="inline-code" {...props}>{children}</code>
            : <code className={className} {...props}>{children}</code>
        }}>{message.content}</ReactMarkdown> : <p>{message.content}</p>}
      </div>
      {isAssistant && <div className="message-actions">
        <button onClick={()=>onCopy(message.content)} title="Copiar resposta"><Copy size={14}/> Copiar</button>
        {last && <button onClick={onRegenerate} disabled={busy} title="Regenerar resposta"><RotateCcw size={14}/> Regenerar</button>}
      </div>}
    </div>
  </div>;
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('syntra-auth') || 'null'); } catch { return null; }
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('syntra-theme') || 'dark');
  const toggleTheme = useCallback(() => setTheme(current => current === 'dark' ? 'light' : 'dark'), []);
  useEffect(() => {
    localStorage.setItem('syntra-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState('qwen3:4b');
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const token = auth?.token;
  const activeConversation = useMemo(()=>conversations.find(c=>c.id===activeId),[conversations,activeId]);

  const logout = useCallback(() => {
    localStorage.removeItem('syntra-auth');
    setAuth(null); setConversations([]); setMessages([]); setActiveId(null);
  }, []);
  useEffect(() => { if (auth) localStorage.setItem('syntra-auth', JSON.stringify(auth)); }, [auth]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      api('/conversations', { token }),
      api('/chat/models', { token }).catch(()=>({models:[],defaultModel:'qwen3:4b'}))
    ]).then(([convData, modelData]) => {
      if (cancelled) return;
      setConversations(convData.conversations || []);
      setModels(modelData.models || []);
      const initialModel = modelData.models?.some(m=>m.name===model) ? model : (modelData.models?.[0]?.name || modelData.defaultModel || 'qwen3:4b');
      setModel(initialModel);
      if (convData.conversations?.length) setActiveId(convData.conversations[0].id);
    }).catch(err=>{if(!cancelled){if(/Sessão inválida|Entre novamente/.test(err.message))logout();else setError(err.message)}});
    return ()=>{cancelled=true};
  }, [token, logout]);
  useEffect(() => {
    if (!token || !activeId) { setMessages([]); return; }
    let cancelled = false;
    setLoadingMessages(true);
    api(`/conversations/${activeId}/messages`,{token}).then(data=>{if(!cancelled)setMessages(data.messages||[])})
      .catch(err=>{if(!cancelled)setError(err.message)})
      .finally(()=>{if(!cancelled)setLoadingMessages(false)});
    return ()=>{cancelled=true};
  }, [token, activeId]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,busy]);
  useEffect(()=>{if(toast){const id=setTimeout(()=>setToast(''),1800);return()=>clearTimeout(id)}},[toast]);

  async function createConversation() {
    setError('');
    try {
      const data = await api('/conversations',{token,method:'POST',body:JSON.stringify({title:'Nova conversa',model})});
      setConversations(old=>[data.conversation,...old]); setActiveId(data.conversation.id); setMessages([]);
      setDraft(''); inputRef.current?.focus();
    } catch(err) { setError(err.message); }
  }
  async function refreshConversations() {
    const data=await api('/conversations',{token}); setConversations(data.conversations||[]);
  }
  async function sendMessage(textOverride) {
    const text=(textOverride ?? draft).trim();
    if(!text||busy||!token)return;
    setError(''); setBusy(true); setDraft('');
    let conversationId=activeId;
    try {
      if(!conversationId) {
        const created=await api('/conversations',{token,method:'POST',body:JSON.stringify({title:text.slice(0,60),model})});
        conversationId=created.conversation.id;
        setActiveId(conversationId);
        setConversations(old=>[created.conversation,...old]);
      }
      const optimistic=[...messages,{role:'user',content:text},{role:'assistant',content:'',pending:true}];
      setMessages(optimistic);
      const data=await api('/chat',{token,method:'POST',body:JSON.stringify({conversationId,message:text,model:activeConversation?.model||model})});
      setMessages(old=>[...old.filter(m=>!m.pending),data.message]);
      await refreshConversations();
    } catch(err) {
      setMessages(old=>old.filter(m=>!m.pending));
      setError(err.message); setDraft(text);
    } finally { setBusy(false); inputRef.current?.focus(); }
  }
  async function regenerate() {
    if(!activeId||busy)return;
    setBusy(true);setError('');
    try {
      const data=await api(`/chat/conversations/${activeId}/regenerate`,{token,method:'POST',body:'{}'});
      setMessages(old=>[...old.slice(0,-1),data.message]);
      await refreshConversations();
    } catch(err){setError(err.message);try{const d=await api(`/conversations/${activeId}/messages`,{token});setMessages(d.messages||[])}catch{}}
    finally{setBusy(false)}
  }
  async function deleteConversation(e,id) {
    e.stopPropagation();
    if(!window.confirm('Excluir esta conversa permanentemente?'))return;
    try {
      await api(`/conversations/${id}`,{token,method:'DELETE'});
      const remaining=conversations.filter(c=>c.id!==id);setConversations(remaining);
      if(activeId===id){setActiveId(remaining[0]?.id||null);setMessages([])}
    }catch(err){setError(err.message)}
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text);setToast('Resposta copiada'); }
    catch { setToast('Não foi possível copiar automaticamente'); }
  }
  if(!auth?.token||!auth?.user) return <AuthScreen theme={theme} onToggleTheme={toggleTheme} onAuth={data=>{setAuth(data);localStorage.setItem('syntra-auth',JSON.stringify(data));}} />;

  return <div className="app-shell" data-theme={theme}>
    <aside className={`sidebar ${sidebarOpen?'open':'closed'}`}>
      <div className="sidebar-top">
        <button className="brand" onClick={()=>{setActiveId(null);setMessages([])}}><span className="brand-mark"><Sparkles size={19}/></span><span>syntra<span className="brand-dot">.</span></span></button>
        <button className="icon-button mobile-only" onClick={()=>setSidebarOpen(false)} aria-label="Fechar menu"><X size={18}/></button>
      </div>
      <button className="new-chat" onClick={createConversation}><Plus size={17}/> Nova conversa <span>Ctrl K</span></button>
      <div className="side-section-label">RECENTES</div>
      <nav className="conversation-list">
        {conversations.map(c=><button key={c.id} className={`conversation-item ${activeId===c.id?'selected':''}`} onClick={()=>{setActiveId(c.id);setSidebarOpen(false);setError('')}}>
          <MessageSquare size={16}/><span>{c.title || 'Nova conversa'}</span><span className="delete-conv" role="button" tabIndex={0} onClick={e=>deleteConversation(e,c.id)} title="Excluir"><Trash2 size={14}/></span>
        </button>)}
        {!conversations.length&&<p className="tiny muted side-empty">Suas conversas aparecerão aqui.</p>}
      </nav>
      <div className="sidebar-bottom">
        <button className="side-action" onClick={()=>setSettingsOpen(true)}><Settings size={17}/> Configurações</button>
        <div className="profile"><div className="avatar"><UserRound size={17}/></div><div className="profile-info"><strong>{auth.user.name}</strong><span>{auth.user.email}</span></div><button className="icon-button" onClick={logout} title="Sair"><LogOut size={17}/></button></div>
      </div>
    </aside>
    <main className="main-panel">
      <header className="topbar">
        <button className="icon-button" onClick={()=>setSidebarOpen(!sidebarOpen)} aria-label="Alternar menu">{sidebarOpen?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}</button>
        <div className="topbar-model"><span className="status-dot"/>{model}</div>
        <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
        <button className="icon-button settings-shortcut" onClick={()=>setSettingsOpen(true)} aria-label="Configurações"><Settings size={18}/></button>
      </header>
      <section className={`chat-scroll ${messages.length?'has-messages':''}`}>
        {loadingMessages ? <div className="center-state"><LoaderCircle className="spin" size={24}/><span>Carregando conversa...</span></div>
        : messages.length===0 ? <div className="welcome">
          <div className="welcome-icon"><Sparkles size={26}/></div>
          <p className="eyebrow">SEU ASSISTENTE PESSOAL</p>
          <h1>O que vamos <span>criar</span> hoje?</h1>
          <p className="welcome-copy">Pergunte, explore ideias ou resolva algo complexo. Vamos começar.</p>
          <div className="suggestion-grid">
            {[
              ['Code2','Escrever código','Crie uma função JavaScript para ordenar uma lista.'],
              ['Lightbulb','Explorar ideias','Me ajude a desenvolver uma ideia de negócio.'],
              ['BookOpen','Aprender algo','Explique redes neurais de forma simples.'],
              ['PenLine','Criar conteúdo','Escreva uma apresentação curta e profissional.']
            ].map(([Icon,label,prompt])=><button key={label} className="suggestion" onClick={()=>sendMessage(prompt)}><span className="suggestion-icon"><Sparkles size={16}/></span><span><strong>{label}</strong><small>{prompt}</small></span></button>)}
          </div>
        </div> : <div className="messages-container">
          {messages.map((m,i)=><Message key={m.id||`${i}-${m.role}`} message={m.pending?{...m,content:'Pensando...'}:m} onCopy={copyText} onRegenerate={regenerate} last={i===messages.length-1&&m.role==='assistant'&&!m.pending} busy={busy}/>)}
          <div ref={bottomRef}/>
        </div>}
      </section>
      <div className="composer-wrap">
        {error&&<div className="inline-error"><AlertCircle size={15}/><span>{error}</span><button onClick={()=>setError('')}><X size={14}/></button></div>}
        <form className="composer" onSubmit={e=>{e.preventDefault();sendMessage()}}>
          <textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder="Envie uma mensagem ao Syntra..." rows={1} maxLength={12000} disabled={busy}/>
          <div className="composer-footer"><span className="composer-hint">Enter para enviar · Shift + Enter para nova linha</span><button className="send-button" type="submit" disabled={busy||!draft.trim()} aria-label="Enviar mensagem">{busy?<LoaderCircle size={17} className="spin"/>:<Send size={17}/>}</button></div>
        </form>
        <p className="disclaimer">O Syntra pode cometer erros. Confira informações importantes.</p>
      </div>
    </main>
    {settingsOpen&&<SettingsModal onClose={()=>setSettingsOpen(false)} models={models} model={model} onModel={async value=>{setModel(value);if(activeId){try{await api(`/conversations/${activeId}`,{token,method:'PATCH',body:JSON.stringify({model:value})});setConversations(old=>old.map(c=>c.id===activeId?{...c,model:value}:c))}catch(err){setError(err.message)}}}} user={auth.user} onLogout={logout}/>}
    {toast&&<div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}
