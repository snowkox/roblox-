import { z } from 'zod';
import { complete, type ChatMessage, type Provider } from './providers.js';
import type { McpTool, McpCall, McpResult } from './mcp.js';

export const plannedCallSchema = z.object({
  serverName: z.string().min(1).max(80),
  toolName: z.string().min(1).max(160),
  arguments: z.unknown().default({}),
  reason: z.string().min(1).max(1000),
  risk: z.enum(['low', 'medium', 'high']).default('medium')
}).strict();
export const planSchema = z.object({
  summary: z.string().min(1).max(6000),
  assumptions: z.array(z.string().max(500)).max(10).default([]),
  calls: z.array(plannedCallSchema).max(12),
  manualSteps: z.array(z.string().max(800)).max(12).default([]),
  safetyNotes: z.array(z.string().max(800)).max(12).default([])
}).strict();
export type AgentPlan = z.infer<typeof planSchema>;
export type AgentHistory = { role: 'user' | 'assistant'; content: string }[];

function compactTools(tools: McpTool[]) {
  return tools.slice(0, 80).map(tool => ({
    serverName: tool.serverName,
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} }
  }));
}

function stripFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export function parsePlan(text: string, tools: McpTool[]): AgentPlan {
  const plan = planSchema.parse(JSON.parse(stripFence(text)));
  const allowed = new Set(tools.map(tool => `${tool.serverName}:${tool.name}`));
  for (const call of plan.calls) {
    if (!allowed.has(`${call.serverName}:${call.toolName}`)) throw new Error(`Ferramenta MCP não permitida ou inexistente: ${call.serverName}/${call.toolName}`);
  }
  return plan;
}

export async function createPlan(provider: Provider, prompt: string, tools: McpTool[], history: AgentHistory): Promise<AgentPlan> {
  const messages: ChatMessage[] = [
    { role: 'system', content: `Você é o Studio Agent, um especialista em Roblox Studio e Luau. Você controla o Roblox Studio apenas por ferramentas MCP fornecidas pelo aplicativo. Responda SEMPRE em português e SOMENTE com JSON puro no formato: {"summary":"o que será feito e como testar", "assumptions":["..."], "calls":[{"serverName":"Roblox_Studio","toolName":"nome_exato","arguments":{},"reason":"por que chamar","risk":"low|medium|high"}], "manualSteps":["..."], "safetyNotes":["..."]}. Nunca invente ferramentas. Use apenas ferramentas listadas. Prefira primeiro observar/listar o projeto antes de editar se houver ferramenta de leitura. Seja conservador: no máximo 12 chamadas por plano. Não publique, não faça compras, não use assets externos suspeitos, não gere backdoors, loadstring, require por ID desconhecido, HTTP externo em scripts de jogo ou código ofuscado. Para mudanças grandes, proponha etapas pequenas. O usuário aprovará as chamadas antes da execução; descreva riscos claramente. Se não houver ferramenta suficiente para executar, deixe calls vazio e explique em manualSteps.` },
    { role: 'user', content: JSON.stringify({ availableMcpTools: compactTools(tools), request: prompt, history: history.slice(-10) }) }
  ];
  const raw = await complete(provider, messages);
  try { return parsePlan(raw, tools); }
  catch {
    const repaired = await complete(provider, [...messages, { role: 'assistant', content: raw.slice(0, 120000) }, { role: 'user', content: 'O JSON ou as ferramentas estavam inválidos. Retorne JSON puro válido usando apenas ferramentas listadas, sem texto fora do JSON.' }]);
    return parsePlan(repaired, tools);
  }
}

export function summarizeToolResult(result: McpResult): string {
  const text = typeof result.content === 'string' ? result.content : JSON.stringify(result.content ?? result.raw);
  return text.length > 4000 ? text.slice(0, 4000) + '\n…resultado truncado…' : text;
}

export function buildFollowUpMessages(prompt: string, plan: AgentPlan, results: Array<{ call: McpCall; result: McpResult }>): ChatMessage[] {
  return [
    { role: 'system', content: 'Você é o Studio Agent. Responda em português com um resumo curto do que aconteceu, próximos passos de teste no Roblox Studio e qualquer alerta de segurança. Não invente sucesso se algum resultado indicar erro.' },
    { role: 'user', content: JSON.stringify({ originalRequest: prompt, approvedPlan: plan, toolResults: results.map(item => ({ call: item.call, result: summarizeToolResult(item.result), isError: item.result.isError })) }) }
  ];
}
