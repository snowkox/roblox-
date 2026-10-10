declare global {
  interface Window {
    studioAgent: {
      state(): Promise<unknown>;
      saveProvider(provider: unknown): Promise<unknown>;
      deleteProvider(id: string): Promise<unknown>;
      selectProvider(id: string): Promise<unknown>;
      testProvider(id: string): Promise<unknown>;
      saveMcpServers(servers: unknown): Promise<unknown>;
      resetRobloxMcp(): Promise<unknown>;
      connectMcp(name: string): Promise<unknown>;
      listMcpTools(): Promise<unknown>;
      plan(input: unknown): Promise<unknown>;
      execute(input: unknown): Promise<unknown>;
    };
  }
}
export {};
