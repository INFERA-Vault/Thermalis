/**
 * THERMALIS Liquid Glass Manager
 * In the hybrid live architecture, glass surfaces rely directly on native browser
 * hardware compositing (`backdrop-filter: blur(3.5px)`) and procedural WebGL overlays.
 * This class provides a backward-compatible singleton interface.
 */

export type SnapshotListener = (canvas: HTMLCanvasElement) => void;

export class LiquidGlassSnapshotManager {
  private static instance: LiquidGlassSnapshotManager;
  private listeners: Set<SnapshotListener> = new Set();

  private constructor() {}

  public static getInstance(): LiquidGlassSnapshotManager {
    if (!LiquidGlassSnapshotManager.instance) {
      LiquidGlassSnapshotManager.instance = new LiquidGlassSnapshotManager();
    }
    return LiquidGlassSnapshotManager.instance;
  }

  public getSnapshot(): HTMLCanvasElement | null {
    return null;
  }

  public invalidate(): void {}

  public subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setMapMoving(_moving: boolean): void {}

  public requestSnapshotRefresh(_delayMs = 200): void {}

  public init(): void {}

  public async captureSnapshot(): Promise<HTMLCanvasElement | null> {
    return null;
  }
}

export { LiquidGlassSnapshotManager as LiquidGlassManager };
export const liquidGlassSnapshotManager = LiquidGlassSnapshotManager.getInstance();
export const liquidGlassManager = liquidGlassSnapshotManager;
