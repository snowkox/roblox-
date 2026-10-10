import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { agentMessages, contextSchema, parseProposal, type Proposal, type StudioContext } from './agent.js';
import { complete, providerSchema, type Provider } from './providers.js';

const dir = resolve('.local');
await mkdir(dir, { recursive: true, mode: 0o700 });
let token: string;
try { token = (await readFile(join(dir, 'token'), 'utf8')).trim(); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  token = randomBytes(32).toString('hex');
  await writeFile(join(dir, 'token'), token, { mode: 0o600, flag: 'wx' });
}
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Token local inválido. Corrija .local/token.');
let providers: Provider[] = [];
try { providers = z.array(providerSchema).max(20).parse(JSON.parse(await readFile(join(dir, 'providers.json'), 'utf8'))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
let context: StudioContext | null = null;
let contextAt = 0;
let generating = false;
type Job = { id: string; proposal: Proposal; context: StudioContext; status: 'pending' | 'applied' | 'failed' | 'cancelled'; message: string };
const proposals = new Map<string, { proposal: Proposal; context: StudioContext | null; approved: boolean }>();
const jobs: Job[] = [];
let saving = Promise.resolve();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!['127.0.0.1:3001', 'localhost:3001'].includes(req.headers.host ?? '')) { res.status(403).json({ error: 'Host não permitido' }); return; }
  const origin = req.headers.origin;
  if (origin && !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://localhost:3001'].includes(origin)) { res.status(403).json({ error: 'Origem não permitida' }); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use('/api', (req, res, next) => {
  const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.status(401).json({ error: 'Token local inválido' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '2mb' }));
const route = (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => { handler(req, res).catch(next); };
app.get('/api/status', (_req, res) => res.json({ studio: contextAt > Date.now() - 20000 ? context : null, jobs: jobs.map(j => ({ id: j.id, status: j.status, message: j.message })) }));
app.get('/api/providers', (_req, res) => res.json(providers.map(({ apiKey, ...p }) => ({ ...p, hasKey: Boolean(apiKey) }))));
app.post('/api/providers', route(async (req, res) => {
  const input = providerSchema.parse(req.body);
  const previous = providers.find(p => p.id === input.id);
  const next = { ...input, apiKey: input.apiKey || previous?.apiKey || '' };
  const replacement = [...providers.filter(p => p.id !== next.id), next];
  if (replacement.length > 20) throw new Error('Limite de 20 providers');
  saving = saving.catch(() => {}).then(async () => {
    const updated = [...providers.filter(p => p.id !== next.id), next];
    if (updated.length > 20) throw new Error('Limite de 20 providers');
    const temp = join(dir, `providers-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(updated, null, 2), { mode: 0o600 });
    await rename(temp, join(dir, 'providers.json'));
    providers = updated;
  });
  await saving;
  res.json({ ok: true });
}));
app.delete('/api/providers/:id', route(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  saving = saving.catch(() => {}).then(async () => {
    const updated = providers.filter(p => p.id !== id);
    const temp = join(dir, `providers-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(updated), { mode: 0o600 });
    await rename(temp, join(dir, 'providers.json')); providers = updated;
  });
  await saving; res.json({ ok: true });
}));
app.post('/api/providers/:id/test', route(async (req, res) => {
  const provider = providers.find(p => p.id === req.params.id);
  if (!provider) { res.status(404).json({ error: 'Provider não encontrado' }); return; }
  await complete(provider, [{ role: 'user', content: 'Responda apenas {"ok":true}' }]);
  res.json({ ok: true });
}));
app.post('/api/chat', route(async (req, res) => {
  const input = z.object({ providerId: z.string().uuid(), prompt: z.string().trim().min(1).max(12000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(30000) }).strict()).max(12) }).strict().parse(req.body);
  const provider = providers.find(p => p.id === input.providerId);
  if (!provider) { res.status(400).json({ error: 'Configure e selecione um provider' }); return; }
  if (generating) { res.status(409).json({ error: 'Já há uma geração em andamento' }); return; }
  generating = true;
  try {
    const snapshot = contextAt > Date.now() - 20000 ? context : null;
    const messages = agentMessages(input.prompt, snapshot, input.history);
    let proposal: Proposal;
    const raw = await complete(provider, messages);
    try { proposal = parseProposal(raw); }
    catch {
      const fixed = await complete(provider, [...messages, { role: 'assistant', content: raw.slice(0, 100000) }, { role: 'user', content: 'O JSON falhou na validação. Retorne JSON puro válido seguindo exatamente o esquema, no máximo 60 operações e sem campos extras.' }]);
      try { proposal = parseProposal(fixed); } catch { throw new Error('O modelo retornou uma proposta inválida após duas tentativas. Tente um pedido menor ou outro modelo.'); }
    }
    const id = randomUUID();
    if (proposals.size >= 100) proposals.delete(proposals.keys().next().value!);
    proposals.set(id, { proposal, context: snapshot, approved: false });
    res.json({ id, proposal, canApply: Boolean(snapshot) });
  } finally { generating = false; }
}));
app.post('/api/proposals/:id/approve', (req, res) => {
  const p = proposals.get(req.params.id);
  if (!p) { res.status(404).json({ error: 'Proposta expirada. Gere outra.' }); return; }
  if (p.approved) { res.status(409).json({ error: 'Proposta já enviada' }); return; }
  if (!p.context || !context || context.sessionId !== p.context.sessionId || contextAt < Date.now() - 20000) { res.status(409).json({ error: 'Conecte o Studio e gere uma nova proposta com contexto atual' }); return; }
  if (jobs.some(j => j.status === 'pending')) { res.status(409).json({ error: 'Aprove ou recuse a tarefa pendente no plugin' }); return; }
  if (jobs.length >= 100) jobs.shift();
  p.approved = true;
  jobs.push({ id: req.params.id, proposal: p.proposal, context: p.context, status: 'pending', message: 'Aguardando confirmação no plugin do Studio' });
  res.json({ ok: true });
});
app.post('/api/studio/context', (req, res, next) => {
  try { context = contextSchema.parse(req.body); contextAt = Date.now(); res.json({ ok: true }); } catch (error) { next(error); }
});
app.get('/api/studio/job', (req, res) => {
  const session = req.query.sessionId;
  res.json(jobs.find(j => j.status === 'pending' && j.context.sessionId === session) ?? null);
});
app.post('/api/studio/result', (req, res, next) => {
  try {
    const result = z.object({ id: z.string().uuid(), sessionId: z.string().uuid(), status: z.enum(['applied', 'failed', 'cancelled']), message: z.string().max(4000) }).strict().parse(req.body);
    const job = jobs.find(j => j.id === result.id && j.context.sessionId === result.sessionId);
    if (!job) { res.status(404).json({ error: 'Tarefa não encontrada' }); return; }
    if (job.status === 'pending') { job.status = result.status; job.message = result.message; }
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.use(express.static(resolve('dist')));
app.get('*', (_req, res) => res.sendFile(resolve('dist/index.html')));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof z.ZodError ? error.issues.map(i => i.message).join('; ') : error instanceof Error ? error.message : 'Erro inesperado';
  res.status(400).json({ error: message.slice(0, 2000) });
});
app.listen(3001, '127.0.0.1', () => {
  console.log('Roblox AI Agent: http://127.0.0.1:3001 (produção) / http://127.0.0.1:5173 (dev)');
  console.log(`Token local para o painel e plugin: ${token}`);
  console.log('Não compartilhe o token. Providers são guardados em .local/providers.json, em texto legível pelo usuário local.');
});
