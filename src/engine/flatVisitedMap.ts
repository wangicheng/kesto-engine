/**
 * High-performance Flat Visited State Hash Map built on contiguous TypedArrays.
 * Eliminates 64-bit IEEE 754 precision loss and avoids V8 GC pauses entirely.
 */
export class FlatVisitedMap {
  private capacity: number;
  private mask: number;
  private count: number = 0;

  private keysLo: Uint32Array;
  private keysHi: Uint32Array;
  private valuesG: Int32Array;

  constructor(initialPowerOfTwoBits = 16) {
    this.capacity = 1 << initialPowerOfTwoBits; // Default 65,536 slots
    this.mask = this.capacity - 1;
    this.keysLo = new Uint32Array(this.capacity);
    this.keysHi = new Uint32Array(this.capacity);
    this.valuesG = new Int32Array(this.capacity);
    this.valuesG.fill(-1);
  }

  /**
   * 64-bit to 32-bit Murmur3 / Mix Hash function.
   */
  private hash(lo: number, hi: number): number {
    let h = (lo ^ Math.imul(hi, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  public get(lo: number, hi: number): number {
    let slot = this.hash(lo, hi) & this.mask;
    let probes = 0;
    while (this.valuesG[slot] !== -1 && probes < 256) {
      if (this.keysLo[slot] === lo && this.keysHi[slot] === hi) {
        return this.valuesG[slot];
      }
      slot = (slot + 1) & this.mask;
      probes++;
    }
    return -1;
  }

  public set(lo: number, hi: number, g: number): void {
    if (this.count > this.capacity * 0.7) {
      this.resize();
    }

    let slot = this.hash(lo, hi) & this.mask;
    let probes = 0;
    while (this.valuesG[slot] !== -1 && probes < 256) {
      if (this.keysLo[slot] === lo && this.keysHi[slot] === hi) {
        this.valuesG[slot] = g;
        return;
      }
      slot = (slot + 1) & this.mask;
      probes++;
    }

    this.keysLo[slot] = lo;
    this.keysHi[slot] = hi;
    this.valuesG[slot] = g;
    this.count++;
  }

  private resize(): void {
    const oldCapacity = this.capacity;
    const oldKeysLo = this.keysLo;
    const oldKeysHi = this.keysHi;
    const oldValuesG = this.valuesG;

    this.capacity *= 2;
    this.mask = this.capacity - 1;
    this.keysLo = new Uint32Array(this.capacity);
    this.keysHi = new Uint32Array(this.capacity);
    this.valuesG = new Int32Array(this.capacity);
    this.valuesG.fill(-1);
    this.count = 0;

    for (let i = 0; i < oldCapacity; i++) {
      if (oldValuesG[i] !== -1) {
        this.set(oldKeysLo[i], oldKeysHi[i], oldValuesG[i]);
      }
    }
  }

  public clear(): void {
    this.valuesG.fill(-1);
    this.count = 0;
  }

  public get size(): number {
    return this.count;
  }
}
