import { SearchNode } from './types';

/**
 * Max heuristic bound on 8x8 grid.
 */
export const MAX_H = 64; 

/**
 * Ring buffer size for Dial's Algorithm (fSlot = f % BUCKET_SPAN).
 * 
 * 數學證明與安全 invariants (Mathematical Invariant & Safety Proof):
 * 在單步邊權重 (delta_g = 1) 且啟發式 Consistent 的 A* 搜尋中，Open Set 內所有活躍節點的 
 * f 值最大跨度必滿足： f_min <= f_active <= f_min + 1 + h_max
 * 
 * 對於 8x8 Grid 而言：
 *   h_max = 64  =>  f 值的最大跨度僅為 65 個桶位。
 * 由於 BUCKET_SPAN (256) >> 65，因此在環形緩衝區中絕對不會發生環形覆蓋 (Wrap-around Overwrite) 錯誤。
 * 
 * ⚠️ 未來修改注意事項 (Note for Future Maintainers):
 * 若未來擴大地圖尺寸 (如 16x16, 32x32) 或改用 Weighted A* (f = g + w*h)，
 * 請務必相應調大 BUCKET_SPAN，確保 BUCKET_SPAN > (w * h_max + 1)。
 */
export const BUCKET_SPAN = 256;

/**
 * High-performance 0-comparison Bucket Priority Queue (Dial's Algorithm).
 * Exploits integer costs and small bounded heuristic range h_max <= 64
 * to achieve O(1) push and O(1) pop operations with zero binary heap sorting.
 */
export class BucketPriorityQueue {
  private buckets: SearchNode[][][];
  private minF: number = Infinity;
  private minH: number = Infinity;
  public size: number = 0;

  constructor() {
    this.buckets = new Array(BUCKET_SPAN);
    for (let f = 0; f < BUCKET_SPAN; f++) {
      this.buckets[f] = new Array(MAX_H + 1);
      for (let h = 0; h <= MAX_H; h++) {
        this.buckets[f][h] = [];
      }
    }
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  push(node: SearchNode): void {
    const f = node.f;
    if (!Number.isFinite(f) || f < 0) return;

    const h = node.h < MAX_H ? Math.max(0, Math.floor(node.h)) : MAX_H;
    const fSlot = Math.floor(f) % BUCKET_SPAN;

    this.buckets[fSlot][h].push(node);
    this.size++;

    if (f < this.minF || (f === this.minF && h < this.minH)) {
      this.minF = f;
      this.minH = h;
    }
  }

  pop(): SearchNode | undefined {
    if (this.size === 0) return undefined;

    while (this.minF !== Infinity) {
      const fSlot = this.minF % BUCKET_SPAN;
      const subBucket = this.buckets[fSlot][this.minH];

      if (subBucket.length > 0) {
        const node = subBucket.pop()!;
        this.size--;
        if (this.size === 0) {
          this.minF = Infinity;
          this.minH = Infinity;
        }
        return node;
      }

      // Advance minH / minF to next non-empty bucket
      this.minH++;
      if (this.minH > MAX_H) {
        this.minH = 0;
        this.minF++;
      }
    }

    return undefined;
  }

  clear(): void {
    for (let f = 0; f < BUCKET_SPAN; f++) {
      for (let h = 0; h <= MAX_H; h++) {
        this.buckets[f][h].length = 0;
      }
    }
    this.minF = Infinity;
    this.minH = Infinity;
    this.size = 0;
  }
}
