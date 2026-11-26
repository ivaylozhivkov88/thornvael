export function installDebugBridge(bridge: Record<string, unknown>): void {
  (window as unknown as { __game: unknown }).__game = bridge;
}
