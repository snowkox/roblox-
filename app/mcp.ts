import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { z } from 'zod';

export const mcpServerSchema = z.object({
  name: z.string().min(1).max(80),
  command: z.string().min(1).max(500),
  args: z.array(z.string().max(1000)).max(50).default([]),
  env: z.record(z.string()).default({})
}).strict();
export type McpServerConfig = z.infer<typeof mcpServerSchema>;
export type McpTool = { name: string; description?: string; inputSchema?: unknown; serverName: string };
export type McpCall = { serverName: string; toolName: string; arguments: unknown };
export type McpResult = { content?: unknown; isError?: boolean; raw: unknown };

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };

function expandWindowsEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, key: string) => process.env[key] ?? process.env[key.toUpperCase()] ?? process.env[key.toLowerCase()] ?? `%${key}%`);
}

export class McpConnection extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private buffer = '';
  private pending = new Map<number, Pending>();
  private connected = false;
  tools: McpTool[] = [];
  constructor(readonly config: McpServerConfig) { super(); }

  get status() { return { name: this.config.name, connected: this.connected, pid: this.child?.pid ?? null, tools: this.tools.length }; }

  async connect(): Promise<McpTool[]> {
    if (this.connected) return this.tools;
    const command = expandWindowsEnv(this.config.command);
    const args = this.config.args.map(expandWindowsEnv);
    this.child = spawn(command, args, { env: { ...process.env, ...this.config.env }, windowsHide: true, stdio: 'pipe' });
    this.child.stdout.on('data', chunk => this.onData(String(chunk)));
    this.child.stderr.on('data', chunk => this.emit('log', `[${this.config.name}] ${String(chunk).trim()}`));
    this.child.on('exit', (code, signal) => {
      this.connected = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Servidor MCP encerrou: código ${code ?? 'n/a'}, sinal ${signal ?? 'n/a'}`));
      }
      this.pending.clear();
      this.emit('disconnect', this.config.name);
    });
    try {
      await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'Studio Agent Desktop', version: '0.2.0' } }, 30_000);
      this.notify('notifications/initialized', {});
      const listed = await this.request('tools/list', {}, 30_000) as { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> };
      this.tools = (listed.tools ?? []).map(tool => ({ ...tool, serverName: this.config.name }));
      this.connected = true;
      return this.tools;
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  disconnect() {
    this.connected = false;
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
    this.tools = [];
  }

  async callTool(toolName: string, args: unknown): Promise<McpResult> {
    if (!this.connected) await this.connect();
    const raw = await this.request('tools/call', { name: toolName, arguments: args ?? {} }, 120_000);
    const result = raw as { content?: unknown; isError?: boolean };
    return { content: result.content, isError: result.isError, raw };
  }

  private notify(method: string, params: unknown) {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.child) throw new Error('Servidor MCP não iniciado');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout no MCP: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  private write(message: unknown) {
    if (!this.child) throw new Error('Servidor MCP não iniciado');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.handleLine(line);
      index = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string) {
    let message: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: unknown };
    try { message = JSON.parse(line); }
    catch { this.emit('log', `[${this.config.name}] saída não JSON: ${line.slice(0, 500)}`); return; }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Erro MCP desconhecido'));
      else pending.resolve(message.result);
    } else if (message.method) {
      this.emit('notification', { serverName: this.config.name, method: message.method, params: message.params });
    }
  }
}

export class McpManager {
  private connections = new Map<string, McpConnection>();
  constructor(private configs: McpServerConfig[]) {}
  setConfigs(configs: McpServerConfig[]) {
    for (const [name, connection] of this.connections) if (!configs.some(config => config.name === name)) { connection.disconnect(); this.connections.delete(name); }
    this.configs = configs;
  }
  listServers() { return this.configs.map(config => ({ ...config, status: this.connections.get(config.name)?.status ?? { name: config.name, connected: false, pid: null, tools: 0 } })); }
  async connect(name: string): Promise<McpTool[]> {
    const config = this.configs.find(server => server.name === name);
    if (!config) throw new Error('Servidor MCP não encontrado');
    let connection = this.connections.get(name);
    if (!connection) { connection = new McpConnection(config); this.connections.set(name, connection); }
    return connection.connect();
  }
  disconnect(name: string) { this.connections.get(name)?.disconnect(); }
  async listTools(): Promise<McpTool[]> {
    const all: McpTool[] = [];
    for (const config of this.configs) all.push(...await this.connect(config.name));
    return all;
  }
  async call(call: McpCall): Promise<McpResult> {
    const connection = this.connections.get(call.serverName) ?? new McpConnection(this.configs.find(config => config.name === call.serverName) ?? (() => { throw new Error('Servidor MCP não encontrado'); })());
    if (!this.connections.has(call.serverName)) this.connections.set(call.serverName, connection);
    return connection.callTool(call.toolName, call.arguments);
  }
  shutdown() { for (const connection of this.connections.values()) connection.disconnect(); this.connections.clear(); }
}

export const defaultRobloxMcp: McpServerConfig = {
  name: 'Roblox_Studio',
  command: 'cmd.exe',
  args: ['/c', '%LOCALAPPDATA%\\Roblox\\mcp.bat'],
  env: {}
};
