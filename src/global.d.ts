import type { StudioAgentApi } from '../electron/preload';

declare global {
  interface Window {
    studioAgent: StudioAgentApi;
  }
}
export {};
