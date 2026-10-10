import { contextBridge, ipcRenderer } from 'electron';

const invoke = <T>(channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload) as Promise<T>;

export const studioAgent = {
  state: () => invoke('app:state'),
  saveProvider: (provider: unknown) => invoke('provider:save', provider),
  deleteProvider: (id: string) => invoke('provider:delete', { id }),
  selectProvider: (id: string) => invoke('provider:select', { id }),
  testProvider: (id: string) => invoke('provider:test', { id }),
  saveMcpServers: (servers: unknown) => invoke('mcp:save', { servers }),
  resetRobloxMcp: () => invoke('mcp:resetRoblox'),
  connectMcp: (name: string) => invoke('mcp:connect', { name }),
  listMcpTools: () => invoke('mcp:tools'),
  plan: (input: unknown) => invoke('agent:plan', input),
  execute: (input: unknown) => invoke('agent:execute', input)
};
contextBridge.exposeInMainWorld('studioAgent', studioAgent);
export type StudioAgentApi = typeof studioAgent;
