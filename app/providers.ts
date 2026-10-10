import { z } from 'zod';

export const providerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  kind: z.enum(['openai', 'ollama']),
  baseUrl: z.string().url().max(1000),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(4000).default('')
}).strict().superRefine((provider, ctx) => {
  const url = new URL(provider.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    ctx.addIssue({ code: 'custom', message: 'Use HTTPS ou HTTP no localhost, sem credenciais, parâmetros ou fragmentos na URL' });
  }
});
export type Provider = z.infer<typeof providerSchema>;
export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string };

type CompletionTool = { name: string; description?: string; inputSchema?: unknown };
type CompletionOptions = { tools?: CompletionTool[] };

export async function complete(provider: Provider, messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
  const base = provider.baseUrl.replace(/\/+$/, '');
  const ollama = provider.kind === 'ollama';
  let response: Response;
  try {
    response = await fetch(base + (ollama ? '/api/chat' : '/chat/completions'), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(180000),
      headers: { 'Content-Type': 'application/json', ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: false,
        ...(ollama ? { format: 'json' } : {}),
        ...(!ollama && options.tools?.length ? { tools: options.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description ?? '', parameters: tool.inputSchema ?? { type: 'object', properties: {} } } })) } : {})
      })
    });
  } catch {
    throw new Error('Não foi possível conectar ao provider. Confira URL, modelo, internet/local e permissões.');
  }
  if (!response.ok) throw new Error(`Provider respondeu HTTP ${response.status}. Confira chave, modelo e saldo.`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('Resposta do provider muito grande');
  const data = JSON.parse(text) as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
  const content = ollama ? data.message?.content : data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Provider não retornou texto');
  return content;
}
