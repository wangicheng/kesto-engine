export interface PriorityNode {
  f: number;
  priority: number;
}

export const MAX_H = 64;
export const BUCKET_SPAN = 256;

export class BucketPriorityQueue<T extends PriorityNode = PriorityNode> {
  private buckets: T[][] = Array.from({ length: BUCKET_SPAN }, () => []);
  private minF: number = 0;
  private count: number = 0;

  public push(node: T): void {
    const fSlot = Math.floor(node.priority) % BUCKET_SPAN;
    this.buckets[fSlot].push(node);
    this.count++;

    if (this.count === 1 || node.priority < this.minF) {
      this.minF = node.priority;
    }
  }

  public pop(): T | undefined {
    if (this.count === 0) return undefined;

    let slot = Math.floor(this.minF) % BUCKET_SPAN;
    while (this.buckets[slot].length === 0) {
      this.minF++;
      slot = Math.floor(this.minF) % BUCKET_SPAN;
    }

    const node = this.buckets[slot].pop()!;
    this.count--;
    return node;
  }

  public isEmpty(): boolean {
    return this.count === 0;
  }

  public clear(): void {
    for (let i = 0; i < BUCKET_SPAN; i++) {
      this.buckets[i].length = 0;
    }
    this.count = 0;
    this.minF = 0;
  }

  public get size(): number {
    return this.count;
  }
}
