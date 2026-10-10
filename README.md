# Studio Agent — Agente de IA para Roblox Studio

Aplicação local com painel React, servidor Node.js e plugin Luau. Descreva uma ideia, gere uma proposta estruturada, revise scripts/propriedades e confirme as alterações no Studio. Projeto independente, sem afiliação com Roblox.

**Estado:** primeira implementação; consulte a aba Actions para os resultados reais de build/testes. A integração do plugin e o código gerado precisam de validação manual no Roblox Studio. Não é um instalador desktop nem um serviço hospedado.

## Recursos

| Recurso | Comportamento |
|---|---|
| Providers configuráveis | Nome, URL base, modelo e chave; OpenAI-compatible e Ollama |
| Chat com contexto | Histórico da conversa atual; estrutura do projeto e código de scripts opcional |
| Propostas | Até 60 criações/atualizações por pedido; revisão individual e exportação JSON |
| Plugin Studio | Comunicação com servidor local e confirmação adicional antes de aplicar |
| Conflitos | Rejeita scripts alterados, classes incompatíveis e caminhos ambíguos |
| Histórico | Registra alterações no Studio e tenta reversão em caso de falha |
| Testes | Validação de propostas, providers e limites; CI de TypeScript e build |

## Instalação para quem não usa Git

| Passo | O que fazer |
|---|---|
| 1 | No GitHub, selecione a branch `feature/roblox-ai-agent` no seletor que mostra `main`. |
| 2 | Clique em **Code → Download ZIP** e extraia a pasta. |
| 3 | Instale Node.js 22 ou superior pelo site oficial: https://nodejs.org/ |
| 4 | Abra a pasta extraída no VS Code. Use **Terminal → New Terminal**. |
| 5 | Execute os comandos abaixo, um por vez. |

```bash
npm install
npm run dev
```

Abra `http://127.0.0.1:5173` no navegador. Copie o **token local** exibido no terminal para a tela de conexão. Não feche o terminal enquanto estiver usando o aplicativo.

Para uma execução sem servidor de desenvolvimento:

```bash
npm run build
npm start
```

Nesse modo abra `http://127.0.0.1:3001`. Não use `vite preview` para a aplicação: a API depende do servidor Node.

## Configurar provider

No painel, abra **Providers**, preencha os campos, clique em **Salvar provider** e depois **Testar**. O teste faz uma pequena solicitação ao modelo e pode consumir créditos. Escolha o provider ativo no Workspace.

| Tipo | URL base | Modelo/chave |
|---|---|---|
| OpenAI-compatible | URL HTTPS da API do seu provider, incluindo `/v1` quando exigido | Use o ID exato do modelo e a chave fornecida pelo provider |
| Ollama | `http://127.0.0.1:11434` | Use o nome de um modelo instalado; normalmente sem chave |

O aplicativo adiciona `/chat/completions` para APIs compatíveis com OpenAI e `/api/chat` para Ollama. APIs nativas de outros providers só funcionam se oferecerem esse formato compatível. O modelo precisa conseguir retornar JSON estruturado com Luau. Respostas inválidas recebem uma tentativa de correção automática; pedidos menores tendem a ser mais confiáveis.

## Instalar o plugin local

| Passo | Ação no Roblox Studio |
|---|---|
| 1 | Abra uma cópia de teste do seu jogo e pare o modo Play. |
| 2 | No Explorer, insira um `Script` temporário em `ServerStorage`. |
| 3 | Abra o arquivo `plugin/AgentBridge.luau` baixado, copie o conteúdo e cole nesse Script. |
| 4 | Clique com o botão direito no Script e use **Save as Local Plugin…**; dê um nome ao plugin. |
| 5 | Apague o Script temporário do jogo. Ele é código de plugin e não deve rodar no jogo. Reinicie o Studio se o botão não aparecer. |
| 6 | Na aba Plugins, abra **Studio Agent**, cole o mesmo token local do painel e clique em **Conectar / desconectar**. |
| 7 | Autorize o acesso HTTP a `127.0.0.1` se o Studio solicitar. |

O plugin usa exclusivamente `http://127.0.0.1:3001`. O nome de comandos/menus pode variar com a versão/idioma do Studio. Não publique o plugin como um script do jogo.

## Primeiro jogo

Conecte o plugin e confira **Studio conectado** no painel. Peça, por exemplo: “Crie um obby com 10 plataformas ancoradas, spawn e chegada, dentro de uma pasta chamada MeuObby”. Revise cada operação. Clique em **Revisar no Studio**, confirme o envio e depois confirme no próprio plugin. Execute **Play** e confira **Script Analysis** e **Output** antes de publicar.

O agente pode criar partes, pastas, modelos, scripts e uma interface básica. Pais precisam ser criados antes dos filhos. Não oferece exclusão de objetos, instalação de assets, publicação, execução de código remoto nem testes automáticos dentro do Studio.

Para editar scripts existentes, ative **Compartilhar código dos scripts: SIM** no plugin, aguarde uma sincronização e gere uma nova proposta. Sem código compartilhado, o plugin rejeita a substituição de scripts existentes. Objetos fora do contexto parcial também não podem ser sobrescritos. O contexto é limitado a 300 instâncias, 10 níveis e aproximadamente 800 KB de código.

## Segurança e dados

| Dado | Armazenamento/envio |
|---|---|
| Chaves de providers | `.local/providers.json`, somente no computador; não retornam ao painel |
| Token de conexão | `.local/token`; o painel mantém uma cópia no sessionStorage da aba |
| Histórico de chat | Memória do painel; perdido ao recarregar/desconectar |
| Propostas/tarefas | Memória do servidor; perdidas ao reiniciar |
| Estrutura do jogo | Enviada ao servidor local e ao provider selecionado ao gerar |
| Código dos scripts | Compartilhado apenas quando ativado no plugin; enviado ao provider durante a geração |

**As chaves não são criptografadas em repouso.** Permissões restritas são usadas onde o sistema operacional suporta; proteja a conta local e backups. `.local/` está no `.gitignore`, mas isso não protege contra alguém com acesso ao computador. Não compartilhe tokens, chaves ou logs contendo o token.

Servidor vinculado ao loopback com validação de Host/Origin e autenticação. Não exponha a porta na internet e não use proxy/túnel público. Para revogar o token, pare o servidor, apague apenas `.local/token` e reinicie; reconecte painel/plugin com o novo token. Para apagar uma chave, exclua o provider e cadastre novamente.

**Código de IA não é uma sandbox.** Scripts criados podem executar quando você iniciar o jogo. Revise `require`, chamadas HTTP, eventos remotos, loops e acesso a dados. As instruções do agente desencorajam padrões inseguros, mas não substituem revisão humana. Salve uma cópia do jogo antes de aplicar; use Desfazer para reverter e confira o resultado. Na falha de aplicação o plugin tenta rollback e comunica se a reversão foi parcial.

## Verificações

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`lint` usa o compilador para detectar variáveis/parâmetros não utilizados; não há ESLint nesta versão. O workflow executa esses comandos e um teste HTTP autenticado do servidor. Não confirma funcionamento de um provider pago nem comportamento do Roblox Studio.

| Teste manual obrigatório | Resultado esperado |
|---|---|
| Adicionar, editar, testar e excluir provider | Chave não aparece nas respostas do painel |
| Conectar painel/plugin com token errado | Conexão recusada |
| Gerar e aplicar obby em place de teste | Proposta revisada; objetos aparecem; nenhuma aplicação sem confirmação |
| Alterar script após gerar proposta | Atualização recusada por conflito |
| Recusar proposta no plugin | Tarefa marcada cancelled |
| Usar Desfazer após aplicação | Alterações revertidas pelo histórico do Studio |
| Executar Play e Script Analysis | Corrigir erros de Luau antes de publicar |

## Estrutura

| Caminho | Responsabilidade |
|---|---|
| `src/` | Interface React |
| `server/index.ts` | API, autenticação, persistência de providers e fila |
| `server/providers.ts` | Adaptadores OpenAI-compatible/Ollama |
| `server/agent.ts` | Prompt e validação de propostas/contexto |
| `server/agent.test.ts` | Testes automatizados |
| `plugin/AgentBridge.luau` | Ponte local e alterações no Studio |
| `novahub` | Arquivo preexistente preservado, não carregado pelo aplicativo |

## Referências técnicas

Documentação oficial consultada em 10/10/2026: [HttpService e plugins locais](https://create.roblox.com/docs/cloud-services/http-service) e [ScriptEditorService](https://create.roblox.com/docs/reference/engine/classes/ScriptEditorService). O plugin usa `GetEditorSource` e `UpdateSourceAsync` para ler/escrever scripts e `ChangeHistoryService` para registrar alterações.
