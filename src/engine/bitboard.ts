import { Position, WallBitboard } from './types';

export const BOARD_SIZE = 8;
export const TOTAL_CELLS = 64;
export const MULTIPLIER_32 = 4294967296; // 2^32

export function posToIndex(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

export function indexToPos(index: number): Position {
  return {
    x: index % BOARD_SIZE,
    y: Math.floor(index / BOARD_SIZE),
  };
}

export function isValidPos(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function arrayToBitboard(indices: number[]): WallBitboard {
  let lo = 0;
  let hi = 0;
  for (const idx of indices) {
    if (idx >= 0 && idx < 32) {
      lo |= (1 << idx);
    } else if (idx >= 32 && idx < TOTAL_CELLS) {
      hi |= (1 << (idx - 32));
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

export function hasWall(bitboard: WallBitboard, index: number): boolean {
  if (index < 0 || index >= TOTAL_CELLS) return true;
  return index < 32
    ? (bitboard.lo & (1 << index)) !== 0
    : (bitboard.hi & (1 << (index - 32))) !== 0;
}

export function bitboardToArray(bitboard: WallBitboard): number[] {
  const result: number[] = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (hasWall(bitboard, i)) {
      result.push(i);
    }
  }
  return result;
}

export function arrayToHiLo(indices: number[]): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (const idx of indices) {
    if (idx < 32) {
      lo |= (1 << idx);
    } else if (idx < 64) {
      hi |= (1 << (idx - 32));
    }
  }
  lo = lo >>> 0;
  hi = hi >>> 0;
  return { lo, hi };
}

export function serializeState(boxes: number[]): string {
  return boxes.join(',');
}

export function boxesToBitboard(boxes: number[]): WallBitboard {
  return arrayToBitboard(boxes);
}
