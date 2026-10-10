import { z } from 'zod';

export const providerSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(80),
  kind: z.enum(['openai', 'ollama']), baseUrl: z.string().url().max(1000),
  model: z.string().min(1).max(200), apiKey: z.string().max(2000).default('')
}).strict().superRefine((p, ctx) => {
  const url = new URL(p.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    ctx.addIssue({ code: 'custom', message: 'Use HTTPS ou HTTP no localhost, sem credenciais, parâmetros ou fragmentos na URL' });
  }
});
export type Provider = z.infer<typeof providerSchema>;
type Message = { role: string; content: string };
export async function complete(provider: Provider, messages: Message[]): Promise<string> {
  const base = provider.baseUrl.replace(/\/+$/, '');
  const ollama = provider.kind === 'ollama';
  let response: Response;
  try {
    response = await fetch(base + (ollama ? '/api/chat' : '/chat/completions'), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify({ model: provider.model, messages, stream: false, ...(ollama ? { format: 'json' } : {}) })
    });
  } catch {
    throw new Error('Não foi possível conectar ao provider em até 120 segundos. Confira a URL e se o modelo está disponível.');
  }
  if (!response.ok) throw new Error(`Provider respondeu HTTP ${response.status}. Confira chave, modelo e saldo. A resposta foi omitida para proteger credenciais.`);
  const text = await response.text();
  if (text.length > 1500000) throw new Error('Resposta do provider muito grande');
  const data = JSON.parse(text) as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
  const content = ollama ? data.message?.content : data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Provider não retornou conteúdo de texto');
  return content;
}
