import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Store from 'electron-store';
import { z } from 'zod';
import { defaultRobloxMcp, McpManager, mcpServerSchema, type McpCall, type McpServerConfig } from '../app/mcp.js';
import { buildFollowUpMessages, createPlan, planSchema, type AgentHistory } from '../app/agent.js';
import { complete, providerSchema, type Provider } from '../app/providers.js';

type StoredProvider = Provider;
type AppState = { providers: StoredProvider[]; mcpServers: McpServerConfig[]; selectedProviderId?: string };
const store = new Store<AppState>({
  name: 'studio-agent-config',
  defaults: { providers: [], mcpServers: [defaultRobloxMcp] }
});
let mcp = new McpManager(store.get('mcpServers'));
let mainWindow: BrowserWindow | null = null;

function safeProviders() { return store.get('providers').map(({ apiKey, ...provider }) => ({ ...provider, hasKey: Boolean(apiKey) })); }
function getProvider(id: string) { const provider = store.get('providers').find(item => item.id === id); if (!provider) throw new Error('Provider não encontrado'); return provider; }
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Studio Agent',
    backgroundColor: '#0b1020',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: join(app.getAppPath(), 'dist-electron/electron/preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadURL(pathToFileURL(join(app.getAppPath(), 'dist/index.html')).toString());
}

function handle<TInput, TOutput>(channel: string, schema: z.ZodType<TInput>, fn: (input: TInput) => Promise<TOutput> | TOutput) {
  ipcMain.handle(channel, async (_event, input) => fn(schema.parse(input)));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => mcp.shutdown());

handle('app:state', z.void(), () => ({ providers: safeProviders(), mcpServers: mcp.listServers(), selectedProviderId: store.get('selectedProviderId') ?? '' }));
handle('provider:save', providerSchema, provider => {
  const providers = store.get('providers');
  const previous = providers.find(item => item.id === provider.id);
  const saved = { ...provider, apiKey: provider.apiKey || previous?.apiKey || '' };
  store.set('providers', [...providers.filter(item => item.id !== saved.id), saved]);
  store.set('selectedProviderId', saved.id);
  return { providers: safeProviders(), selectedProviderId: saved.id };
});
handle('provider:delete', z.object({ id: z.string().uuid() }), ({ id }) => {
  store.set('providers', store.get('providers').filter(provider => provider.id !== id));
  if (store.get('selectedProviderId') === id) store.delete('selectedProviderId');
  return { providers: safeProviders(), selectedProviderId: store.get('selectedProviderId') ?? '' };
});
handle('provider:select', z.object({ id: z.string().uuid() }), ({ id }) => { getProvider(id); store.set('selectedProviderId', id); return { ok: true }; });
handle('provider:test', z.object({ id: z.string().uuid() }), async ({ id }) => { await complete(getProvider(id), [{ role: 'user', content: 'Responda apenas OK.' }]); return { ok: true }; });
handle('mcp:save', z.object({ servers: z.array(mcpServerSchema).min(1).max(20) }), ({ servers }) => {
  const names = new Set<string>();
  for (const server of servers) { if (names.has(server.name)) throw new Error(`Nome MCP duplicado: ${server.name}`); names.add(server.name); }
  store.set('mcpServers', servers);
  mcp.setConfigs(servers);
  return mcp.listServers();
});
handle('mcp:resetRoblox', z.void(), () => { store.set('mcpServers', [defaultRobloxMcp]); mcp.setConfigs([defaultRobloxMcp]); return mcp.listServers(); });
handle('mcp:connect', z.object({ name: z.string().min(1) }), async ({ name }) => ({ tools: await mcp.connect(name), servers: mcp.listServers() }));
handle('mcp:tools', z.void(), async () => ({ tools: await mcp.listTools(), servers: mcp.listServers() }));
handle('agent:plan', z.object({ providerId: z.string().uuid(), prompt: z.string().trim().min(1).max(16000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(30000) })).max(20).default([]) }), async ({ providerId, prompt, history }) => {
  const tools = await mcp.listTools();
  if (!tools.length) throw new Error('Nenhuma ferramenta MCP disponível. Abra o Roblox Studio e conecte o MCP.');
  const plan = await createPlan(getProvider(providerId), prompt, tools, history as AgentHistory);
  return { plan, tools };
});
handle('agent:execute', z.object({ providerId: z.string().uuid(), prompt: z.string().trim().min(1).max(16000), plan: planSchema }), async ({ providerId, prompt, plan }) => {
  const results: Array<{ call: McpCall; result: Awaited<ReturnType<McpManager['call']>> }> = [];
  for (const item of plan.calls) {
    const call: McpCall = { serverName: item.serverName, toolName: item.toolName, arguments: item.arguments };
    results.push({ call, result: await mcp.call(call) });
  }
  const summary = plan.calls.length ? await complete(getProvider(providerId), buildFollowUpMessages(prompt, plan, results)) : plan.summary;
  return { summary, results };
});
