import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Provider = { id: string; name: string; kind: 'openai' | 'ollama'; baseUrl: string; model: string; hasKey?: boolean; apiKey?: string };
type McpServer = { name: string; command: string; args: string[]; env: Record<string, string>; status?: { connected: boolean; pid: number | null; tools: number } };
type McpTool = { serverName: string; name: string; description?: string; inputSchema?: unknown };
type PlannedCall = { serverName: string; toolName: string; arguments: unknown; reason: string; risk: 'low' | 'medium' | 'high' };
type Plan = { summary: string; assumptions: string[]; calls: PlannedCall[]; manualSteps: string[]; safetyNotes: string[] };
type Entry = { role: 'user' | 'assistant'; content: string; plan?: Plan; executed?: boolean; id: string };
type State = { providers: Provider[]; mcpServers: McpServer[]; selectedProviderId: string };
const api = window.studioAgent;
const blankProvider = (): Provider => ({ id: crypto.randomUUID(), name: '', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '' });
const defaultPrompt = 'Crie um obby bonito com tema neon, spawn, checkpoints simples e uma chegada com mensagem de vitória.';

export default function App() {
  const [state, setState] = useState<State>({ providers: [], mcpServers: [], selectedProviderId: '' });
  const [tab, setTab] = useState<'home' | 'providers' | 'mcp'>('home');
  const [providerForm, setProviderForm] = useState<Provider>(blankProvider);
  const [mcpText, setMcpText] = useState('');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selectedProvider = state.providers.find(p => p.id === state.selectedProviderId);
  const connected = state.mcpServers.some(server => server.status?.connected);
  const dangerCount = useMemo(() => entries.flatMap(e => e.plan?.calls ?? []).filter(call => call.risk === 'high').length, [entries]);

  async function refresh() {
    const next = await api.state() as State;
    setState(next);
    setMcpText(JSON.stringify({ mcpServers: Object.fromEntries(next.mcpServers.map(server => [server.name, { command: server.command, args: server.args, env: server.env }])) }, null, 2));
  }
  useEffect(() => { void run(refresh); }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api.saveProvider(providerForm) as { providers: Provider[]; selectedProviderId: string };
      setState(previous => ({ ...previous, ...result }));
      setProviderForm(blankProvider());
      setNotice('Provider salvo com segurança no computador.');
    });
  }
  async function saveMcp(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const parsed = JSON.parse(mcpText) as { mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> };
      const servers = Object.entries(parsed.mcpServers ?? {}).map(([name, config]) => ({ name, command: config.command, args: config.args ?? [], env: config.env ?? {} }));
      const mcpServers = await api.saveMcpServers(servers) as McpServer[];
      setState(previous => ({ ...previous, mcpServers }));
      setNotice('Configuração MCP salva.');
    });
  }
  async function connectAllMcp() {
    await run(async () => {
      const collected: McpTool[] = [];
      let servers = state.mcpServers;
      for (const server of state.mcpServers) {
        const result = await api.connectMcp(server.name) as { tools: McpTool[]; servers: McpServer[] };
        collected.push(...result.tools); servers = result.servers;
      }
      setTools(collected); setState(previous => ({ ...previous, mcpServers: servers }));
      setNotice(`${collected.length} ferramentas MCP disponíveis.`);
    });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !selectedProvider) return;
    const request = prompt.trim();
    setPrompt('');
    setEntries(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: request }]);
    await run(async () => {
      const result = await api.plan({ providerId: selectedProvider.id, prompt: request, history: entries.map(({ role, content }) => ({ role, content })) }) as { plan: Plan; tools: McpTool[] };
      setTools(result.tools);
      setEntries(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: result.plan.summary, plan: result.plan }]);
    });
  }
  async function execute(entry: Entry) {
    if (!selectedProvider || !entry.plan) return;
    const high = entry.plan.calls.some(call => call.risk === 'high');
    const ok = confirm(`${high ? 'Atenção: há ações de alto risco.\n\n' : ''}Executar ${entry.plan.calls.length} chamada(s) MCP no Roblox Studio? Revise tudo antes de confirmar.`);
    if (!ok) return;
    await run(async () => {
      const result = await api.execute({ providerId: selectedProvider.id, prompt: entries.findLast(e => e.role === 'user')?.content ?? '', plan: entry.plan }) as { summary: string };
      setEntries(prev => prev.map(item => item.id === entry.id ? { ...item, executed: true } : item).concat({ id: crypto.randomUUID(), role: 'assistant', content: result.summary }));
    });
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="logo"><div className="logo-mark">S✦</div><div><strong>Studio Agent</strong><span>Roblox MCP Desktop</span></div></div>
      <button className={tab === 'home' ? 'nav active' : 'nav'} onClick={() => setTab('home')}>Workspace</button>
      <button className={tab === 'providers' ? 'nav active' : 'nav'} onClick={() => setTab('providers')}>Providers</button>
      <button className={tab === 'mcp' ? 'nav active' : 'nav'} onClick={() => setTab('mcp')}>Roblox MCP</button>
      <div className="status-card"><span className={connected ? 'pulse on' : 'pulse'} />{connected ? 'MCP conectado' : 'MCP offline'}<small>{tools.length} ferramentas · {state.providers.length} providers</small>{dangerCount > 0 && <small className="warn">{dangerCount} ação(ões) de alto risco planejadas</small>}</div>
    </aside>
    <main className="main">
      <header className="hero"><div><p className="eyebrow">AGENTE DESKTOP PARA ROBLOX STUDIO</p><h1>{tab === 'home' ? 'Crie jogos no Studio com IA e aprovação humana.' : tab === 'providers' ? 'Configure seu modelo de IA.' : 'Conecte ao MCP do Roblox Studio.'}</h1></div><button onClick={() => void run(refresh)} disabled={busy}>Atualizar</button></header>
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert notice">{notice}</div>}
      {tab === 'home' && <section className="home-grid"><div className="chat-panel"><div className="topbar"><label>Provider ativo<select value={state.selectedProviderId} onChange={e => void run(async () => { await api.selectProvider(e.target.value); setState(p => ({ ...p, selectedProviderId: e.target.value })); })}><option value="">Selecione</option>{state.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}</select></label><button onClick={connectAllMcp} disabled={busy}>Conectar MCP</button></div><div className="messages">{entries.length === 0 && <div className="empty-state"><div className="orb">✦</div><h2>Seu game designer com ferramentas reais.</h2><p>Abra o Roblox Studio, conecte o MCP e peça uma mudança. O agente planeja as chamadas e você aprova antes de mexer no Studio.</p><div className="chips">{['Crie um obby neon com checkpoints', 'Analise meu place e sugira melhorias', 'Crie uma arena de batalha com placar'].map(text => <button key={text} onClick={() => setPrompt(text)}>{text}</button>)}</div></div>}{entries.map(entry => <article key={entry.id} className={`message ${entry.role}`}><span>{entry.role === 'user' ? 'Você' : 'Studio Agent'}</span><p>{entry.content}</p>{entry.plan && <div className="plan"><h3>Plano de execução</h3>{entry.plan.assumptions.length > 0 && <ul>{entry.plan.assumptions.map(item => <li key={item}>{item}</li>)}</ul>}{entry.plan.calls.map((call, index) => <details key={`${call.toolName}-${index}`}><summary><b className={`risk ${call.risk}`}>{call.risk}</b>{call.serverName} / {call.toolName}</summary><p>{call.reason}</p><pre>{JSON.stringify(call.arguments, null, 2)}</pre></details>)}{entry.plan.manualSteps.length > 0 && <div className="manual"><b>Passos manuais</b>{entry.plan.manualSteps.map(step => <p key={step}>{step}</p>)}</div>}{entry.plan.safetyNotes.length > 0 && <div className="manual warnbox"><b>Segurança</b>{entry.plan.safetyNotes.map(step => <p key={step}>{step}</p>)}</div>}<button className="primary" disabled={busy || entry.executed || entry.plan.calls.length === 0} onClick={() => void execute(entry)}>{entry.executed ? 'Executado' : `Aprovar ${entry.plan.calls.length} chamada(s) MCP`}</button></div>}</article>)}{busy && <div className="thinking">Trabalhando…</div>}</div><form className="composer" onSubmit={send}><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Descreva o jogo ou a alteração no Roblox Studio…" /><button className="primary" disabled={busy || !selectedProvider || !prompt.trim()}>Planejar com IA</button></form></div><aside className="inspector"><h2>Checklist</h2><div className="step done">App desktop Electron</div><div className={state.providers.length ? 'step done' : 'step'}>Provider configurado</div><div className={connected ? 'step done' : 'step'}>MCP Roblox conectado</div><div className={tools.length ? 'step done' : 'step'}>Ferramentas MCP carregadas</div><h2>Ferramentas</h2><div className="tool-list">{tools.slice(0, 18).map(tool => <div key={`${tool.serverName}-${tool.name}`}><strong>{tool.name}</strong><small>{tool.description || tool.serverName}</small></div>)}{!tools.length && <p>Conecte o MCP para listar ferramentas.</p>}</div></aside></section>}
      {tab === 'providers' && <section className="split"><div><h2>Providers salvos</h2>{state.providers.map(provider => <article className="card" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.kind} · {provider.model}</small><small>{provider.baseUrl}</small></div><div className="row"><button onClick={() => setProviderForm({ ...provider, apiKey: '' })}>Editar</button><button onClick={() => void run(async () => { await api.testProvider(provider.id); setNotice('Provider testado com sucesso.'); })}>Testar</button><button onClick={() => void run(async () => { const result = await api.deleteProvider(provider.id) as { providers: Provider[]; selectedProviderId: string }; setState(p => ({ ...p, ...result })); })}>Excluir</button></div></article>)}{!state.providers.length && <p className="muted">Adicione um provider para o agente pensar.</p>}</div><form className="form-card" onSubmit={saveProvider}><h2>{state.providers.some(p => p.id === providerForm.id) ? 'Editar provider' : 'Novo provider'}</h2><label>Nome<input required value={providerForm.name} onChange={e => setProviderForm({ ...providerForm, name: e.target.value })} placeholder="Minha IA" /></label><label>Tipo<select value={providerForm.kind} onChange={e => setProviderForm({ ...providerForm, kind: e.target.value as Provider['kind'], baseUrl: e.target.value === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1' })}><option value="openai">OpenAI-compatible</option><option value="ollama">Ollama local</option></select></label><label>URL base<input required value={providerForm.baseUrl} onChange={e => setProviderForm({ ...providerForm, baseUrl: e.target.value })} /></label><label>Modelo<input required value={providerForm.model} onChange={e => setProviderForm({ ...providerForm, model: e.target.value })} placeholder="gpt-4.1, llama3.1, etc." /></label><label>Chave<input type="password" value={providerForm.apiKey ?? ''} onChange={e => setProviderForm({ ...providerForm, apiKey: e.target.value })} placeholder={providerForm.hasKey ? 'Em branco mantém a chave atual' : 'Opcional para Ollama'} /></label><button className="primary" disabled={busy}>Salvar provider</button><button type="button" onClick={() => setProviderForm(blankProvider())}>Limpar</button></form></section>}
      {tab === 'mcp' && <section className="split"><div><h2>Servidores MCP</h2>{state.mcpServers.map(server => <article className="card" key={server.name}><div><strong>{server.name}</strong><small>{server.command} {server.args.join(' ')}</small><small>{server.status?.connected ? `Conectado · PID ${server.status.pid}` : 'Desconectado'}</small></div><button onClick={() => void run(async () => { const result = await api.connectMcp(server.name) as { tools: McpTool[]; servers: McpServer[] }; setTools(result.tools); setState(p => ({ ...p, mcpServers: result.servers })); })}>Conectar</button></article>)}<button onClick={() => void run(async () => { const mcpServers = await api.resetRobloxMcp() as McpServer[]; setState(p => ({ ...p, mcpServers })); setMcpText(JSON.stringify({ mcpServers: { Roblox_Studio: { command: 'cmd.exe', args: ['/c', '%LOCALAPPDATA%\\Roblox\\mcp.bat'] } } }, null, 2)); })}>Restaurar Roblox MCP padrão</button></div><form className="form-card wide" onSubmit={saveMcp}><h2>Configuração MCP</h2><p className="muted">Formato compatível com o que você mandou. O app expande variáveis como <code>%LOCALAPPDATA%</code>.</p><textarea className="jsonbox" value={mcpText} onChange={e => setMcpText(e.target.value)} spellCheck={false} /><button className="primary" disabled={busy}>Salvar MCP</button></form></section>}
    </main>
  </div>;
}
