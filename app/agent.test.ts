import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from './agent.js';
import { defaultRobloxMcp, mcpServerSchema } from './mcp.js';
import { providerSchema } from './providers.js';

const tools = [{ serverName: 'Roblox_Studio', name: 'create_part', description: 'create a part', inputSchema: { type: 'object' } }];

test('valida provider HTTPS e Ollama local', () => {
  const base = { id: '0501e791-8e3e-4676-aee7-aa9da4785eb4', name: 'Local', kind: 'ollama' as const, baseUrl: 'http://127.0.0.1:11434', model: 'llama' };
  assert.equal(providerSchema.parse(base).apiKey, '');
  assert.equal(providerSchema.safeParse({ ...base, kind: 'openai', baseUrl: 'https://api.openai.com/v1' }).success, true);
  for (const baseUrl of ['http://example.com', 'https://user@example.com', 'https://example.com?key=x', 'file:///tmp/x']) {
    assert.equal(providerSchema.safeParse({ ...base, baseUrl }).success, false);
  }
});

test('configuração MCP padrão do Roblox é válida', () => {
  const parsed = mcpServerSchema.parse(defaultRobloxMcp);
  assert.equal(parsed.name, 'Roblox_Studio');
  assert.deepEqual(parsed.args, ['/c', '%LOCALAPPDATA%\\Roblox\\mcp.bat']);
});

test('plano aceita somente ferramentas MCP existentes', () => {
  const ok = JSON.stringify({ summary: 'Criar parte', assumptions: [], calls: [{ serverName: 'Roblox_Studio', toolName: 'create_part', arguments: { name: 'Obby' }, reason: 'criar mapa', risk: 'low' }], manualSteps: [], safetyNotes: [] });
  assert.equal(parsePlan(ok, tools).calls.length, 1);
  const bad = JSON.stringify({ summary: 'bad', calls: [{ serverName: 'Roblox_Studio', toolName: 'delete_everything', arguments: {}, reason: 'bad', risk: 'high' }] });
  assert.throws(() => parsePlan(bad, tools));
});

test('plano limita quantidade de chamadas e tamanho de textos', () => {
  const many = JSON.stringify({ summary: 'x', calls: Array.from({ length: 13 }, () => ({ serverName: 'Roblox_Studio', toolName: 'create_part', arguments: {}, reason: 'x', risk: 'low' })) });
  assert.throws(() => parsePlan(many, tools));
});
