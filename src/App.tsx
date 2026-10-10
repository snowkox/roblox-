import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Proposal } from '../server/agent';

type Provider = { id: string; name: string; kind: 'openai' | 'ollama'; baseUrl: string; model: string; hasKey?: boolean };
type Entry = { role: 'user' | 'assistant'; content: string; id?: string; proposal?: Proposal; canApply?: boolean; sent?: boolean };
type Status = { studio: { placeName: string; items: unknown[]; truncated: boolean } | null; jobs: { id: string; status: string; message: string }[] };
const emptyProvider = (): Provider & { apiKey: string } => ({ id: crypto.randomUUID(), name: '', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '' });
export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('agent-token') ?? '');
  const [tokenInput, setTokenInput] = useState('');
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'chat' | 'settings'>('chat');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState('');
  const [form, setForm] = useState(emptyProvider);
  const [status, setStatus] = useState<Status>({ studio: null, jobs: [] });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const api = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const response = await fetch('/api' + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) setReady(false);
      throw new Error(data.error ?? 'Não foi possível concluir a operação');
    }
    return data as T;
  }, [token]);
  const loadProviders = useCallback(async () => {
    const list = await api<Provider[]>('/providers');
    setProviders(list);
    setSelected(current => list.some(p => p.id === current) ? current : list[0]?.id ?? '');
  }, [api]);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const refresh = async () => {
      try { const next = await api<Status>('/status'); if (live) { setStatus(next); setReady(true); } }
      catch (e) { if (live) setError((e as Error).message); }
    };
    void loadProviders().catch(e => { if (live) setError((e as Error).message); });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [token, api, loadProviders]);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function connect(event: FormEvent) {
    event.preventDefault();
    const value = tokenInput.trim();
    sessionStorage.setItem('agent-token', value); setToken(value); setTokenInput(''); setError('');
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    const request = prompt.trim();
    const history = entries.slice(-12).map(e => ({ role: e.role, content: e.content.slice(0, 30000) }));
    setEntries(previous => [...previous, { role: 'user', content: request }]); setPrompt('');
    await action(async () => {
      const result = await api<{ id: string; proposal: Proposal; canApply: boolean }>('/chat', 'POST', { providerId: selected, prompt: request, history });
      setEntries(previous => [...previous, { role: 'assistant', content: result.proposal.summary, ...result }]);
    });
  }
  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const { id, name, kind, baseUrl, model, apiKey } = form;
      await api('/providers', 'POST', { id, name, kind, baseUrl, model, apiKey });
      await loadProviders(); setSelected(id); setForm(emptyProvider()); setNotice('Provider salvo no computador.');
    });
  }
  function download(entry: Entry) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(entry.proposal, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'roblox-proposal.json'; link.click(); URL.revokeObjectURL(url);
  }
  if (!ready) return <main className="connect"><div className="brand">R<span>✦</span></div><p className="eyebrow">ROBLOX AI AGENT</p><h1>Seu próximo jogo<br />começa aqui.</h1><p>Inicie o servidor local e cole o token exibido no console. Ele autentica este painel e o plugin do Studio.</p><form onSubmit={connect}><label htmlFor="token">Token local</label><input id="token" type="password" required value={tokenInput} onChange={e => setTokenInput(e.target.value)} autoComplete="off" placeholder="Cole o token do servidor" /><button className="primary">Conectar ao agente</button></form>{error && <p role="alert" className="error">{error}</p>}<small>Conexão local. Não compartilhe seu token.</small></main>;
  return <div className="layout"><aside><div className="logo"><span className="brand small">R✦</span><strong>Studio Agent<small>IDEIAS → JOGOS</small></strong></div><button className={tab === 'chat' ? 'nav active' : 'nav'} onClick={() => setTab('chat')}>◈ Workspace</button><button className={tab === 'settings' ? 'nav active' : 'nav'} onClick={() => setTab('settings')}>⚙ Providers</button><div className="sidebar-bottom"><div className="connection"><span className={status.studio ? 'dot online' : 'dot'} />{status.studio ? 'Studio conectado' : 'Studio desconectado'}</div><small>{status.studio?.placeName ?? 'Abra o plugin e conecte o token'}</small><button className="text-button" onClick={() => { sessionStorage.removeItem('agent-token'); setToken(''); setReady(false); setEntries([]); setProviders([]); setStatus({ studio: null, jobs: [] }); }}>Desconectar painel</button></div></aside><main className="workspace"><header><div><p className="eyebrow">SEU COPILOTO DE CRIAÇÃO</p><h1>{tab === 'chat' ? 'Vamos construir algo incrível.' : 'Sua IA, do seu jeito.'}</h1></div><span className="badge">LOCAL FIRST</span></header>{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {tab === 'settings' ? <section className="settings"><div><h2>Providers configurados</h2><p>Escolha seu modelo e mantenha o controle das credenciais.</p>{providers.map(provider => <article className="provider" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.model} · {provider.kind === 'ollama' ? 'Ollama' : 'OpenAI-compatible'}</small><small>{provider.baseUrl}</small></div><div className="row"><button disabled={busy} onClick={() => setForm({ ...provider, apiKey: '' })}>Editar</button><button disabled={busy} onClick={() => void action(async () => { await api(`/providers/${provider.id}/test`, 'POST'); setNotice('Conexão com o provider confirmada.'); })}>Testar</button><button disabled={busy} onClick={() => { if (confirm(`Excluir o provider ${provider.name}?`)) void action(async () => { await api(`/providers/${provider.id}`, 'DELETE'); await loadProviders(); }); }}>Excluir</button></div></article>)}{!providers.length && <p className="empty">Nenhum provider ainda. Adicione o primeiro ao lado.</p>}<div className="info"><strong>Sobre suas chaves</strong><p>São armazenadas no servidor local, em <code>.local/providers.json</code>. Não são enviadas ao GitHub nem retornadas ao painel. O arquivo não é criptografado: proteja sua conta e seus backups.</p><p>O contexto e o código do jogo serão enviados ao provider selecionado. A geração pode consumir créditos.</p></div></div><form className="card" onSubmit={saveProvider}><h2>{providers.some(p => p.id === form.id) ? 'Editar provider' : 'Adicionar provider'}</h2><label>Nome<input required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Minha IA" /></label><label>Tipo<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as Provider['kind'], baseUrl: e.target.value === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1' })}><option value="openai">OpenAI-compatible</option><option value="ollama">Ollama local</option></select></label><label>URL base<input type="url" required value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} /></label><small>OpenAI-compatible: inclua /v1 quando necessário. Ollama: sem /api.</small><label>Modelo<input required maxLength={200} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="ID exato do modelo" /></label><label>Chave de API<input type="password" autoComplete="off" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder={form.hasKey ? 'Em branco mantém a chave atual' : 'Opcional para Ollama'} /></label><button className="primary" disabled={busy}>{busy ? 'Aguarde…' : 'Salvar provider'}</button><button type="button" disabled={busy} onClick={() => setForm(emptyProvider())}>Novo provider</button></form></section> : <><div className="toolbar"><label>Modelo ativo<select aria-label="Provider ativo" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecione um provider</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name} / {p.model}</option>)}</select></label><span>{status.studio ? `${status.studio.items.length} objetos no contexto${status.studio.truncated ? ' (parcial)' : ''}` : 'Sem contexto • propostas novas'}</span><button disabled={busy} onClick={() => { if (confirm('Limpar o histórico deste painel?')) setEntries([]); }}>Nova conversa</button></div><section className="conversation" aria-live="polite">{!entries.length && <div className="welcome"><div className="orb">✦</div><h2>Da ideia ao Roblox Studio.</h2><p>Descreva o jogo. O agente propõe o mapa, os scripts e a interface.<br />Você revisa e decide o que entra no projeto.</p><div className="suggestions">{['Crie um obby com 10 plataformas e uma chegada', 'Crie uma arena com spawn e placar básico', 'Crie uma interface de boas-vindas para meu jogo'].map(text => <button key={text} onClick={() => setPrompt(text)}>{text}<span>↗</span></button>)}</div></div>}{entries.map((entry, i) => <article className={`message ${entry.role}`} key={entry.id ?? i}><div className="message-label">{entry.role === 'user' ? 'VOCÊ' : 'STUDIO AGENT'}</div><p className="message-content">{entry.content}</p>{entry.proposal && <><div className="proposal-header">{entry.proposal.operations.length} alterações propostas</div>{entry.proposal.operations.map((op, index) => <details key={index}><summary><span>{op.className}</span> {op.path.join(' / ')}</summary><pre>{op.source ?? JSON.stringify(op.properties, null, 2)}</pre></details>)}<div className="row"><button className="primary" disabled={busy || entry.sent || !entry.canApply || !status.studio || !entry.proposal.operations.length} onClick={() => { if (!confirm('Revise todos os scripts. Enviar esta proposta para confirmação no Studio?')) return; void action(async () => { await api(`/proposals/${entry.id}/approve`, 'POST'); setEntries(previous => previous.map(e => e.id === entry.id ? { ...e, sent: true } : e)); setNotice('Proposta enviada. Confirme no plugin do Studio.'); }); }}>{entry.sent ? 'Enviado ao Studio' : 'Revisar no Studio →'}</button><button onClick={() => download(entry)}>Exportar JSON</button></div>{!entry.canApply && <small>Para aplicar: conecte o plugin e gere uma nova proposta.</small>}</>}</article>)}{busy && <div className="thinking" role="status">✦ Trabalhando… Isso pode levar até alguns minutos.</div>}</section><form className="composer" onSubmit={send}><textarea aria-label="Descreva seu jogo" maxLength={12000} rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Descreva seu jogo ou peça uma melhoria…" /><div><small>Revise o código gerado. IA pode errar. Teste no Studio antes de publicar.</small><button className="primary" disabled={busy || !selected || !prompt.trim()}>{busy ? 'Gerando…' : 'Criar proposta ↗'}</button></div></form>{status.jobs.length > 0 && <section className="job-log"><h3>Atividade do Studio</h3>{status.jobs.slice(-5).map(job => <p key={job.id}><strong>{job.status}</strong> — {job.message}</p>)}</section>}</>}
  </main></div>;
}
