/**
 * Lightweight concurrency guard that tracks active job IDs and enforces a max limit.
 * Used by AgentRunner to keep WebSocket and polling paths consistent.
 */
export class CapacityGate {
  private active = new Set<string>();

  constructor(private readonly limit: number) {}

  /** Current active count. */
  size(): number {
    return this.active.size;
  }

  /** Whether an id is already being processed. */
  has(id: string): boolean {
    return this.active.has(id);
  }

  /** Whether we're currently at max capacity. */
  atCapacity(): boolean {
    return this.active.size >= this.limit;
  }

  /**
   * Try to reserve a slot for the given id.
   * Returns false if the id is already active or we're at capacity.
   */
  tryEnter(id: string): boolean {
    if (this.has(id) || this.atCapacity()) return false;
    this.active.add(id);
    return true;
  }

  /** Release a previously reserved slot. Safe to call even if the id isn't active. */
  exit(id: string): void {
    this.active.delete(id);
  }
}

export default CapacityGate;
