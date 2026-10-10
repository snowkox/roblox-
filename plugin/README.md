# Plugin legado

Este diretório contém a ponte Luau da primeira versão experimental.

A arquitetura atual do **Studio Agent** usa **Roblox Studio MCP** diretamente no aplicativo desktop Electron. Para o fluxo novo, configure o MCP no app com:

```json
{
  "mcpServers": {
    "Roblox_Studio": {
      "command": "cmd.exe",
      "args": ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"]
    }
  }
}
```

Não instale este plugin legado a menos que você esteja testando a versão antiga.
