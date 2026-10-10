# Studio Agent — Desktop AI Agent para Roblox Studio

Aplicativo desktop local feito com **Electron + React + TypeScript** para criar jogos no Roblox Studio com IA. Ele funciona como um **host MCP**: conecta ao MCP do Roblox Studio, lista as ferramentas disponíveis, deixa a IA planejar ações e só executa depois da sua aprovação.

> Projeto em desenvolvimento. A branch `feature/roblox-ai-agent` contém a versão desktop. Valide tudo em uma cópia de teste do seu jogo antes de usar em projetos importantes.

## O que ele faz

| Área | Funcionalidade |
|---|---|
| Desktop real | Abre como aplicativo Electron, sem navegador externo obrigatório |
| Providers | Configuração local de providers OpenAI-compatible e Ollama |
| Roblox Studio | Conexão via MCP usando `cmd.exe /c %LOCALAPPDATA%\\Roblox\\mcp.bat` |
| Agente | Planeja ações usando as ferramentas MCP reais disponíveis |
| Segurança | Mostra ferramenta, argumentos, motivo e risco antes de executar |
| Interface | Layout premium com sidebar, workspace, cards, chat e inspector |
| Dados locais | Chaves e MCP servers ficam no armazenamento local do app, fora do GitHub |

## Configuração MCP padrão

O app já vem com esta configuração:

```json
{
  "mcpServers": {
    "Roblox_Studio": {
      "command": "cmd.exe",
      "args": [
        "/c",
        "%LOCALAPPDATA%\\Roblox\\mcp.bat"
      ]
    }
  }
}
```

Você pode editar isso na aba **Roblox MCP** do app.

## Como rodar em desenvolvimento

Instale Node.js 22+ e execute:

```bash
npm install
npm run dev
```

Isso abre o aplicativo Electron e o renderer Vite local.

## Como gerar um app instalável no Windows

```bash
npm install
npm run package:win
```

O instalador ficará na pasta `release/`.

## Primeiro uso

| Passo | Ação |
|---|---|
| 1 | Abra o Roblox Studio e deixe o MCP do Roblox disponível no caminho `%LOCALAPPDATA%\\Roblox\\mcp.bat`. |
| 2 | Rode `npm run dev` ou abra o app instalado. |
| 3 | Vá em **Providers** e adicione seu provider de IA. |
| 4 | Vá em **Roblox MCP** e clique em **Conectar** no servidor `Roblox_Studio`. |
| 5 | Volte para **Workspace**, escolha o provider e peça uma criação. |
| 6 | Revise o plano: ferramenta, argumentos, motivo e risco. |
| 7 | Clique em **Aprovar chamadas MCP** apenas se concordar. |
| 8 | Teste no Roblox Studio antes de publicar. |

## Providers suportados

| Tipo | Exemplo de URL | Observação |
|---|---|---|
| OpenAI-compatible | `https://api.openai.com/v1` | O app chama `/chat/completions` |
| Ollama | `http://127.0.0.1:11434` | O app chama `/api/chat` |

APIs de outros providers precisam ser compatíveis com o formato OpenAI Chat Completions.

## Segurança

| Risco | Mitigação no app |
|---|---|
| IA executar ações indesejadas | O app cria um plano e pede aprovação humana antes de chamar tools MCP |
| Ferramentas inventadas | O plano é validado contra a lista real de ferramentas MCP disponíveis |
| Chaves no GitHub | Chaves ficam no armazenamento local do Electron e não são commitadas |
| Alterações perigosas no Studio | Cada chamada mostra `risk: low / medium / high` e argumentos antes da execução |
| Provider receber contexto | Só use providers confiáveis; pedidos e resultados podem ser enviados ao modelo |

Mesmo com validação, revise tudo. IA pode errar. Use uma cópia de teste do place e salve antes de executar alterações grandes.

## Estrutura

| Caminho | Função |
|---|---|
| `electron/main.ts` | Processo principal, armazenamento local, IPC, providers, MCP e execução |
| `electron/preload.ts` | API segura exposta ao React |
| `app/mcp.ts` | Cliente MCP stdio para Roblox Studio |
| `app/agent.ts` | Planejamento da IA e validação de ferramentas |
| `app/providers.ts` | Providers OpenAI-compatible/Ollama |
| `src/App.tsx` | Interface desktop |
| `src/styles.css` | Visual do aplicativo |
| `plugin/` | Legado da primeira versão; não é o fluxo atual |
| `novahub` | Arquivo preexistente preservado |

## Verificações

```bash
npm run typecheck
npm test
npm run build
```

Ainda é necessário validar manualmente com o Roblox Studio MCP instalado no Windows.

## Status atual

| Item | Status |
|---|---|
| Desktop Electron | Implementado |
| UI bonita e funcional | Implementada |
| Providers configuráveis | Implementado |
| MCP Roblox padrão | Implementado |
| Aprovação antes de executar | Implementado |
| Testes de validação | Implementados |
| Validação real no Roblox Studio | Pendente no seu PC |
| Build/CI remoto | Pendente |
