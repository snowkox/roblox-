import test from 'node:test';
import assert from 'node:assert/strict';
import { agentMessages, contextSchema, parseProposal } from './agent.js';
import { providerSchema } from './providers.js';

const proposal = { summary: 'Criar plataforma', operations: [{ path: ['Workspace', 'Plataforma'], className: 'Part', properties: { Anchored: true, Size: [20, 1, 20] } }] };
test('aceita proposta estruturada e JSON cercado por markdown', () => {
  assert.equal(parseProposal(JSON.stringify(proposal)).operations.length, 1);
  assert.equal(parseProposal('```json\n' + JSON.stringify(proposal) + '\n```').summary, proposal.summary);
});
test('bloqueia classes e serviços não permitidos', () => {
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ path: ['Lighting', 'Objeto'], className: 'Part' }] })));
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ path: ['Workspace', 'Objeto'], className: 'RemoteEvent' }] })));
});
test('bloqueia caminhos ambíguos, propriedades desconhecidas e duplicações', () => {
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ path: ['Workspace', '../Objeto'], className: 'Part' }] })));
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ ...proposal.operations[0], properties: { Source: 'bad' } }] })));
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [proposal.operations[0], proposal.operations[0]] })));
});
test('limita operações e exige source apenas em scripts', () => {
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: Array(61).fill(proposal.operations[0]) })));
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ path: ['ServerScriptService', 'Main'], className: 'Script' }] })));
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ ...proposal.operations[0], source: 'print(1)' }] })));
  assert.equal(parseProposal(JSON.stringify({ summary: 'Script', operations: [{ path: ['ServerScriptService', 'Main'], className: 'Script', source: 'print("ok")' }] })).operations[0].source, 'print("ok")');
});
test('valida propriedades por classe e limites de vetor', () => {
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ path: ['Workspace', 'Pasta'], className: 'Folder', properties: { Size: [1, 1, 1] } }] })));
  assert.throws(() => parseProposal(JSON.stringify({ ...proposal, operations: [{ ...proposal.operations[0], properties: { Color: [2, 0, 0] } }] })));
});
const provider = { id: '0501e791-8e3e-4676-aee7-aa9da4785eb4', name: 'Local', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'modelo' };
test('provider aceita HTTPS e HTTP local, rejeita credenciais e HTTP remoto', () => {
  assert.equal(providerSchema.parse(provider).apiKey, '');
  assert.ok(providerSchema.safeParse({ ...provider, baseUrl: 'https://example.com/v1' }).success);
  for (const baseUrl of ['http://example.com', 'https://secret@example.com', 'https://example.com?key=secret', 'file:///tmp/test', 'https://example.com/#key']) {
    assert.equal(providerSchema.safeParse({ ...provider, baseUrl }).success, false);
  }
});
test('contexto é limitado e sessão é obrigatória', () => {
  assert.ok(contextSchema.safeParse({ sessionId: provider.id, placeName: 'Teste', placeId: 0, items: [] }).success);
  assert.equal(contextSchema.safeParse({ placeName: 'Teste', placeId: 0, items: [] }).success, false);
});
test('histórico é limitado e contexto não muda o papel system', () => {
  const messages = agentMessages('Criar obby', null, Array(20).fill({ role: 'user', content: 'texto' }));
  assert.equal(messages.length, 14);
  assert.equal(messages[0].role, 'system');
  assert.match(messages.at(-1)!.content, /Criar obby/);
});
