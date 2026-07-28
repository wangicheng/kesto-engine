import { WallBitboard } from './types';
import { hasWall, BOARD_SIZE, TOTAL_CELLS, arrayToHiLo } from './bitboard';

// 1. Static precomputed board lookup tables (Built once when module is imported)
export const POS_X = new Uint8Array(TOTAL_CELLS);
export const POS_Y = new Uint8Array(TOTAL_CELLS);

// 4096-element tables (boxIdx * 64 + targetIdx)
export const DX_RIGHT = new Uint8Array(TOTAL_CELLS * TOTAL_CELLS);
export const DX_LEFT = new Uint8Array(TOTAL_CELLS * TOTAL_CELLS);
export const DY_DOWN = new Uint8Array(TOTAL_CELLS * TOTAL_CELLS);
export const DY_UP = new Uint8Array(TOTAL_CELLS * TOTAL_CELLS);

// Initialize static coordinate tables
for (let c = 0; c < TOTAL_CELLS; c++) {
  POS_X[c] = c % BOARD_SIZE;
  POS_Y[c] = Math.floor(c / BOARD_SIZE);
}

// Precalculate cell-pair displacement tables
for (let c = 0; c < TOTAL_CELLS; c++) {
  for (let g = 0; g < TOTAL_CELLS; g++) {
    const idx = c * TOTAL_CELLS + g;
    DX_RIGHT[idx] = Math.max(0, POS_X[g] - POS_X[c]);
    DX_LEFT[idx] = Math.max(0, POS_X[c] - POS_X[g]);
    DY_DOWN[idx] = Math.max(0, POS_Y[g] - POS_Y[c]);
    DY_UP[idx] = Math.max(0, POS_Y[c] - POS_Y[g]);
  }
}

// Precomputed static permutations for k = 1 to 6
function generatePermutations(n: number): Int32Array {
  const result: number[] = [];
  const p = new Array<number>(n);
  for (let i = 0; i < n; i++) p[i] = i;
  const used = new Array<boolean>(n).fill(false);

  function search(depth: number) {
    if (depth === n) {
      result.push(...p);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        used[i] = true;
        p[depth] = i;
        search(depth + 1);
        used[i] = false;
      }
    }
  }
  search(0);
  return new Int32Array(result);
}

export type HeuristicMode = 'auto' | 'perm' | 'hungarian';

const PERMUTATIONS_CACHE: Int32Array[] = [];

function getPermutations(n: number): Int32Array {
  if (n <= 0) return new Int32Array(0);
  if (!PERMUTATIONS_CACHE[n]) {
    PERMUTATIONS_CACHE[n] = generatePermutations(n);
  }
  return PERMUTATIONS_CACHE[n];
}

const UNREACHABLE = 9999;

// Reusable Hungarian algorithm buffers for k >= 5 (up to max grid size 64)
const hU = new Int32Array(65);
const hV = new Int32Array(65);
const hP = new Int32Array(65);
const hWay = new Int32Array(65);
const hMinV = new Int32Array(65);
const hUsed = new Uint8Array(65);
const costMatrix = new Int32Array(65 * 65);

function solveHungarian(k: number): number {
  hU.fill(0, 0, k + 1);
  hV.fill(0, 0, k + 1);
  hP.fill(0, 0, k + 1);
  hWay.fill(0, 0, k + 1);

  for (let i = 1; i <= k; i++) {
    hP[0] = i;
    let j0 = 0;
    hMinV.fill(UNREACHABLE, 0, k + 1);
    hUsed.fill(0, 0, k + 1);

    do {
      hUsed[j0] = 1;
      const i0 = hP[j0];
      let delta = UNREACHABLE;
      let j1 = 0;

      for (let j = 1; j <= k; j++) {
        if (!hUsed[j]) {
          const cur = costMatrix[(i0 - 1) * k + (j - 1)] - hU[i0] - hV[j];
          if (cur < hMinV[j]) {
            hMinV[j] = cur;
            hWay[j] = j0;
          }
          if (hMinV[j] < delta) {
            delta = hMinV[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= k; j++) {
        if (hUsed[j]) {
          hU[hP[j]] += delta;
          hV[j] -= delta;
        } else {
          hMinV[j] -= delta;
        }
      }

      j0 = j1;
    } while (hP[j0] !== 0);

    do {
      const j1 = hWay[j0];
      hP[j0] = hP[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  return -hV[0];
}

/**
 * LevelHeuristicContext holds precalculated goal distance tables for a level.
 * Built once when the solver initializes a level search session.
 */
export class LevelHeuristicContext {
  public readonly numTargets: number;
  public readonly targets: Int32Array;
  public readonly targetLo: number;
  public readonly targetHi: number;
  public readonly targetSpanX: number;
  public readonly targetSpanY: number;

  // Flat table of size (numTargets * 64). Dist from cell c to target t = goalDistMap[t * 64 + c]
  public readonly goalDistMap: Int32Array;
  // Quick check: min goal dist for cell c across ALL targets
  public readonly minGoalDistAll: Uint16Array;

  // Precomputed target pair relative displacement matrices
  public readonly targetRelX: Int8Array;
  public readonly targetRelY: Int8Array;

  // Unconditional target-independent relative displacement sets for k >= 7
  public readonly uniqueRelX: Int8Array;
  public readonly uniqueRelY: Int8Array;

  constructor(walls: WallBitboard, targetsArr: number[]) {
    this.numTargets = targetsArr.length;
    this.targets = new Int32Array(targetsArr);
    const { lo, hi } = arrayToHiLo(targetsArr);
    this.targetLo = lo;
    this.targetHi = hi;

    this.targetRelX = new Int8Array(this.numTargets * this.numTargets);
    this.targetRelY = new Int8Array(this.numTargets * this.numTargets);
    const relXSet = new Set<number>();
    const relYSet = new Set<number>();

    for (let t1 = 0; t1 < this.numTargets; t1++) {
      const g1 = targetsArr[t1];
      const g1x = POS_X[g1];
      const g1y = POS_Y[g1];
      for (let t2 = 0; t2 < this.numTargets; t2++) {
        const g2 = targetsArr[t2];
        const g2x = POS_X[g2];
        const g2y = POS_Y[g2];
        const idx = t1 * this.numTargets + t2;
        this.targetRelX[idx] = g1x - g2x;
        this.targetRelY[idx] = g1y - g2y;

        if (t1 !== t2) {
          relXSet.add(g1x - g2x);
          relYSet.add(g1y - g2y);
        }
      }
    }

    this.uniqueRelX = new Int8Array(Array.from(relXSet));
    this.uniqueRelY = new Int8Array(Array.from(relYSet));

    let tMinX = 8, tMaxX = 0, tMinY = 8, tMaxY = 0;
    for (const tCell of targetsArr) {
      const tx = POS_X[tCell];
      const ty = POS_Y[tCell];
      if (tx < tMinX) tMinX = tx;
      if (tx > tMaxX) tMaxX = tx;
      if (ty < tMinY) tMinY = ty;
      if (ty > tMaxY) tMaxY = ty;
    }
    this.targetSpanX = Math.max(0, tMaxX - tMinX);
    this.targetSpanY = Math.max(0, tMaxY - tMinY);

    this.goalDistMap = new Int32Array(this.numTargets * TOTAL_CELLS);
    this.goalDistMap.fill(UNREACHABLE);
    this.minGoalDistAll = new Uint16Array(TOTAL_CELLS);
    this.minGoalDistAll.fill(UNREACHABLE);

    for (let t = 0; t < this.numTargets; t++) {
      const targetIdx = targetsArr[t];
      const offsetT = t * TOTAL_CELLS;

      if (hasWall(walls, targetIdx)) continue;

      this.goalDistMap[offsetT + targetIdx] = 0;
      const queue: number[] = [targetIdx];
      let head = 0;

      while (head < queue.length) {
        const currIdx = queue[head++];
        const currDist = this.goalDistMap[offsetT + currIdx];

        const cx = POS_X[currIdx];
        const cy = POS_Y[currIdx];

        // Explore 4 grid directions
        if (cx < BOARD_SIZE - 1 && !hasWall(walls, currIdx + 1) && this.goalDistMap[offsetT + currIdx + 1] === UNREACHABLE) {
          this.goalDistMap[offsetT + currIdx + 1] = currDist + 1;
          queue.push(currIdx + 1);
        }
        if (cx > 0 && !hasWall(walls, currIdx - 1) && this.goalDistMap[offsetT + currIdx - 1] === UNREACHABLE) {
          this.goalDistMap[offsetT + currIdx - 1] = currDist + 1;
          queue.push(currIdx - 1);
        }
        if (cy < BOARD_SIZE - 1 && !hasWall(walls, currIdx + BOARD_SIZE) && this.goalDistMap[offsetT + currIdx + BOARD_SIZE] === UNREACHABLE) {
          this.goalDistMap[offsetT + currIdx + BOARD_SIZE] = currDist + 1;
          queue.push(currIdx + BOARD_SIZE);
        }
        if (cy > 0 && !hasWall(walls, currIdx - BOARD_SIZE) && this.goalDistMap[offsetT + currIdx - BOARD_SIZE] === UNREACHABLE) {
          this.goalDistMap[offsetT + currIdx - BOARD_SIZE] = currDist + 1;
          queue.push(currIdx - BOARD_SIZE);
        }
      }
    }

    // Populate minGoalDistAll for fast initial deadlock / unreachable box check
    for (let c = 0; c < TOTAL_CELLS; c++) {
      let minD = UNREACHABLE;
      for (let t = 0; t < this.numTargets; t++) {
        const d = this.goalDistMap[t * TOTAL_CELLS + c];
        if (d < minD) minD = d;
      }
      this.minGoalDistAll[c] = minD;
    }
  }

  public hasUnreachableBox(boxes: number[]): boolean {
    for (let i = 0; i < boxes.length; i++) {
      if (this.minGoalDistAll[boxes[i]] === UNREACHABLE) return true;
    }
    return false;
  }
}

// Static reusable buffers for box coordinates (zero-allocation, supports up to 64 boxes)
const tempBoxX = new Int8Array(65);
const tempBoxY = new Int8Array(65);

/**
 * Fast O(k) admissible heuristic calculation directly from box indices.
 */
export function calculateHeuristic(
  boxes: number[],
  targets: number[],
  context: LevelHeuristicContext,
  mode: HeuristicMode = 'auto'
): number {
  const k = boxes.length;
  if (k === 0 || targets.length === 0) return 0;
  if (targets.length !== k) return Infinity;

  // Single-pass unpack box coordinates
  for (let i = 0; i < k; i++) {
    const b = boxes[i];
    tempBoxX[i] = POS_X[b];
    tempBoxY[i] = POS_Y[b];
  }

  // Calculate box bounding box span
  let bMinX = 8, bMaxX = 0, bMinY = 8, bMaxY = 0;
  for (let i = 0; i < k; i++) {
    const bx = tempBoxX[i];
    const by = tempBoxY[i];
    if (bx < bMinX) bMinX = bx;
    if (bx > bMaxX) bMaxX = bx;
    if (by < bMinY) bMinY = by;
    if (by > bMaxY) bMaxY = by;
  }
  const boxSpanX = bMaxX - bMinX;
  const boxSpanY = bMaxY - bMinY;

  let dispersionPenalty = 0;
  if (context.targetSpanX > boxSpanX) {
    dispersionPenalty += Math.ceil((context.targetSpanX - boxSpanX) / 2);
  }
  if (context.targetSpanY > boxSpanY) {
    dispersionPenalty += Math.ceil((context.targetSpanY - boxSpanY) / 2);
  }

  const useHungarian = mode === 'hungarian' || (mode === 'auto' && k >= 5);

  if (useHungarian) {
    let maxRight = 0;
    let maxLeft = 0;
    let maxDown = 0;
    let maxUp = 0;

    for (let i = 0; i < k; i++) {
      const bIdx = boxes[i];
      let minPairRight = UNREACHABLE;
      let minPairLeft = UNREACHABLE;
      let minPairDown = UNREACHABLE;
      let minPairUp = UNREACHABLE;

      for (let t = 0; t < k; t++) {
        const targetCell = context.targets[t];
        const pairOffset = bIdx * TOTAL_CELLS + targetCell;
        const dxR = DX_RIGHT[pairOffset];
        const dxL = DX_LEFT[pairOffset];
        const dyD = DY_DOWN[pairOffset];
        const dyU = DY_UP[pairOffset];

        if (dxR < minPairRight) minPairRight = dxR;
        if (dxL < minPairLeft) minPairLeft = dxL;
        if (dyD < minPairDown) minPairDown = dyD;
        if (dyU < minPairUp) minPairUp = dyU;

        const bfsDist = context.goalDistMap[t * TOTAL_CELLS + bIdx];
        costMatrix[i * k + t] = bfsDist;
      }

      if (minPairRight > maxRight) maxRight = minPairRight;
      if (minPairLeft > maxLeft) maxLeft = minPairLeft;
      if (minPairDown > maxDown) maxDown = minPairDown;
      if (minPairUp > maxUp) maxUp = minPairUp;
    }

    const h4Max = maxRight + maxLeft + maxDown + maxUp;
    const minBfsSum = solveHungarian(k);
    if (minBfsSum >= UNREACHABLE) return Infinity;

    // Unconditional target-independent decoupling bound for k >= 7
    let maxDecoupleX = 0;
    let maxDecoupleY = 0;

    const relX = context.uniqueRelX;
    const relY = context.uniqueRelY;
    const lenX = relX.length;
    const lenY = relY.length;

    for (let i = 0; i < k - 1; i++) {
      const b1x = tempBoxX[i];
      const b1y = tempBoxY[i];

      for (let j = i + 1; j < k; j++) {
        const dxBox = b1x - tempBoxX[j];
        const dyBox = b1y - tempBoxY[j];

        let minDiffX = 999;
        for (let m = 0; m < lenX; m++) {
          const d = Math.abs(dxBox - relX[m]);
          if (d < minDiffX) minDiffX = d;
        }

        let minDiffY = 999;
        for (let m = 0; m < lenY; m++) {
          const d = Math.abs(dyBox - relY[m]);
          if (d < minDiffY) minDiffY = d;
        }

        if (minDiffX > maxDecoupleX) maxDecoupleX = minDiffX;
        if (minDiffY > maxDecoupleY) maxDecoupleY = minDiffY;
      }
    }

    const maxDecouple = maxDecoupleX + maxDecoupleY;
    const baseH = Math.max(h4Max, Math.ceil(minBfsSum / k), maxDecouple);
    return baseH + dispersionPenalty;
  }

  const perms = getPermutations(k);
  if (!perms || perms.length === 0) return 0;

  const numPerms = perms.length / k;
  let minH = UNREACHABLE;

  const numT = context.numTargets;
  const targetRelX = context.targetRelX;
  const targetRelY = context.targetRelY;

  for (let p = 0; p < numPerms; p++) {
    const permOffset = p * k;

    let maxRight = 0;
    let maxLeft = 0;
    let maxDown = 0;
    let maxUp = 0;
    let maxBfs = 0;
    let validMatching = true;

    for (let i = 0; i < k; i++) {
      const boxIdx = boxes[i];
      const targetIdxInArr = perms[permOffset + i];
      const targetCell = context.targets[targetIdxInArr];

      const pairOffset = boxIdx * TOTAL_CELLS + targetCell;
      const dxR = DX_RIGHT[pairOffset];
      const dxL = DX_LEFT[pairOffset];
      const dyD = DY_DOWN[pairOffset];
      const dyU = DY_UP[pairOffset];

      if (dxR > maxRight) maxRight = dxR;
      if (dxL > maxLeft) maxLeft = dxL;
      if (dyD > maxDown) maxDown = dyD;
      if (dyU > maxUp) maxUp = dyU;

      const bfsDist = context.goalDistMap[targetIdxInArr * TOTAL_CELLS + boxIdx];
      if (bfsDist === UNREACHABLE) {
        validMatching = false;
        break;
      }
      if (bfsDist > maxBfs) maxBfs = bfsDist;
    }

    if (!validMatching) continue;

    const h4Max = maxRight + maxLeft + maxDown + maxUp;

    let maxDecoupleX = 0;
    let maxDecoupleY = 0;

    for (let i = 0; i < k - 1; i++) {
      const b1x = tempBoxX[i];
      const b1y = tempBoxY[i];
      const t1Idx = perms[permOffset + i];
      const t1RowOffset = t1Idx * numT;

      for (let j = i + 1; j < k; j++) {
        const b2x = tempBoxX[j];
        const b2y = tempBoxY[j];
        const t2Idx = perms[permOffset + j];

        // Decoupling relative displacement difference via precomputed matrix
        const tRelIdx = t1RowOffset + t2Idx;
        const dxTarget = targetRelX[tRelIdx];
        const dyTarget = targetRelY[tRelIdx];

        const dxBox = b1x - b2x;
        const dyBox = b1y - b2y;

        const pairDecoupleX = Math.abs(dxBox - dxTarget);
        const pairDecoupleY = Math.abs(dyBox - dyTarget);

        if (pairDecoupleX > maxDecoupleX) maxDecoupleX = pairDecoupleX;
        if (pairDecoupleY > maxDecoupleY) maxDecoupleY = pairDecoupleY;
      }
    }

    const maxDecouple = maxDecoupleX + maxDecoupleY;

    let baseH = h4Max > maxBfs ? h4Max : maxBfs;
    if (maxDecouple > baseH) {
      baseH = maxDecouple;
    }

    if (baseH < minH) {
      minH = baseH;
    }
  }

  return minH === UNREACHABLE ? Infinity : minH + dispersionPenalty;
}

/**
 * Fast O(1) Goal test using native Uint32 lo and hi comparison to eliminate precision loss.
 */
export function isGoalReached(currentLo: number, currentHi: number, targetLo: number, targetHi: number): boolean {
  return currentLo === targetLo && currentHi === targetHi;
}
