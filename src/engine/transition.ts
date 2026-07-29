import { Direction, BoxState, WallBitboard, TransitionResult } from './types';
import { bitboardToArray } from './bitboard';

const NOT_COL7_MASK = 0x7f7f7f7f;
const NOT_COL0_MASK = 0xfefefefe;
const COL0_MASK = 0x01010101;
const COL7_MASK = 0x80808080;
const ROW0_MASK = 0x000000ff;
const ROW7_MASK = 0xff000000;

/**
 * High-Performance Dual 32-bit SMI Integer Bitwise Parallel Sliding Engine.
 * Operates directly on native V8 Small Integers (SMI) with zero memory allocation,
 * achieving high-throughput state transitions.
 */
export function moveStepBitboard(
  bLo: number,
  bHi: number,
  wLo: number,
  wHi: number,
  dir: Direction
): { lo: number; hi: number } {
  let mLo = bLo >>> 0;
  let mHi = bHi >>> 0;

  for (let iter = 0; iter < 8; ++iter) {
    let edgeBlockedLo = 0;
    let edgeBlockedHi = 0;

    if (dir === 'UP') edgeBlockedLo = mLo & ROW0_MASK;
    else if (dir === 'DOWN') edgeBlockedHi = mHi & ROW7_MASK;
    else if (dir === 'LEFT') {
      edgeBlockedLo = mLo & COL0_MASK;
      edgeBlockedHi = mHi & COL0_MASK;
    } else if (dir === 'RIGHT') {
      edgeBlockedLo = mLo & COL7_MASK;
      edgeBlockedHi = mHi & COL7_MASK;
    }

    let destLo = 0;
    let destHi = 0;
    if (dir === 'UP') {
      destLo = ((mLo >>> 8) | ((mHi & 0xff) << 24)) >>> 0;
      destHi = (mHi >>> 8) >>> 0;
    } else if (dir === 'DOWN') {
      destLo = (mLo << 8) >>> 0;
      destHi = ((mHi << 8) | ((mLo >>> 24) & 0xff)) >>> 0;
    } else if (dir === 'LEFT') {
      destLo = ((mLo >>> 1) & NOT_COL7_MASK) >>> 0;
      destHi = ((mHi >>> 1) & NOT_COL7_MASK) >>> 0;
    } else {
      destLo = ((mLo << 1) & NOT_COL0_MASK) >>> 0;
      destHi = ((mHi << 1) & NOT_COL0_MASK) >>> 0;
    }

    const statLo = (bLo ^ mLo) >>> 0;
    const statHi = (bHi ^ mHi) >>> 0;

    const blockDestLo = (destLo & (wLo | statLo)) >>> 0;
    const blockDestHi = (destHi & (wHi | statHi)) >>> 0;

    let blockedSrcLo = edgeBlockedLo;
    let blockedSrcHi = edgeBlockedHi;

    if (dir === 'UP') {
      const unshiftedLo = (blockDestLo << 8) >>> 0;
      const unshiftedHi = ((blockDestHi << 8) | ((blockDestLo >>> 24) & 0xff)) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    } else if (dir === 'DOWN') {
      const unshiftedLo = ((blockDestLo >>> 8) | ((blockDestHi & 0xff) << 24)) >>> 0;
      const unshiftedHi = (blockDestHi >>> 8) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    } else if (dir === 'LEFT') {
      const unshiftedLo = ((blockDestLo << 1) & NOT_COL0_MASK) >>> 0;
      const unshiftedHi = ((blockDestHi << 1) & NOT_COL0_MASK) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    } else if (dir === 'RIGHT') {
      const unshiftedLo = ((blockDestLo >>> 1) & NOT_COL7_MASK) >>> 0;
      const unshiftedHi = ((blockDestHi >>> 1) & NOT_COL7_MASK) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    }

    blockedSrcLo = blockedSrcLo >>> 0;
    blockedSrcHi = blockedSrcHi >>> 0;

    if (blockedSrcLo === 0 && blockedSrcHi === 0) break;

    mLo = (mLo ^ blockedSrcLo) >>> 0;
    mHi = (mHi ^ blockedSrcHi) >>> 0;
  }

  let finalDestLo = 0;
  let finalDestHi = 0;
  if (dir === 'UP') {
    finalDestLo = ((mLo >>> 8) | ((mHi & 0xff) << 24)) >>> 0;
    finalDestHi = (mHi >>> 8) >>> 0;
  } else if (dir === 'DOWN') {
    finalDestLo = (mLo << 8) >>> 0;
    finalDestHi = ((mHi << 8) | ((mLo >>> 24) & 0xff)) >>> 0;
  } else if (dir === 'LEFT') {
    finalDestLo = ((mLo >>> 1) & NOT_COL7_MASK) >>> 0;
    finalDestHi = ((mHi >>> 1) & NOT_COL7_MASK) >>> 0;
  } else {
    finalDestLo = ((mLo << 1) & NOT_COL0_MASK) >>> 0;
    finalDestHi = ((mHi << 1) & NOT_COL0_MASK) >>> 0;
  }

  return {
    lo: (((bLo ^ mLo) | finalDestLo) >>> 0),
    hi: (((bHi ^ mHi) | finalDestHi) >>> 0),
  };
}

/**
 * Zero-allocation variant writing into reusable output Uint32Array (out[0]=lo, out[1]=hi).
 * dirCode: 0 = UP, 1 = DOWN, 2 = LEFT, 3 = RIGHT
 */
export function moveStepBitboardFast(
  bLo: number,
  bHi: number,
  wLo: number,
  wHi: number,
  dirCode: number,
  out: Uint32Array
): boolean {
  let mLo = bLo >>> 0;
  let mHi = bHi >>> 0;

  for (let iter = 0; iter < 8; ++iter) {
    let edgeBlockedLo = 0;
    let edgeBlockedHi = 0;

    if (dirCode === 0) edgeBlockedLo = mLo & ROW0_MASK;
    else if (dirCode === 1) edgeBlockedHi = mHi & ROW7_MASK;
    else if (dirCode === 2) {
      edgeBlockedLo = mLo & COL0_MASK;
      edgeBlockedHi = mHi & COL0_MASK;
    } else {
      edgeBlockedLo = mLo & COL7_MASK;
      edgeBlockedHi = mHi & COL7_MASK;
    }

    let destLo = 0;
    let destHi = 0;
    if (dirCode === 0) {
      destLo = ((mLo >>> 8) | ((mHi & 0xff) << 24)) >>> 0;
      destHi = (mHi >>> 8) >>> 0;
    } else if (dirCode === 1) {
      destLo = (mLo << 8) >>> 0;
      destHi = ((mHi << 8) | ((mLo >>> 24) & 0xff)) >>> 0;
    } else if (dirCode === 2) {
      destLo = ((mLo >>> 1) & NOT_COL7_MASK) >>> 0;
      destHi = ((mHi >>> 1) & NOT_COL7_MASK) >>> 0;
    } else {
      destLo = ((mLo << 1) & NOT_COL0_MASK) >>> 0;
      destHi = ((mHi << 1) & NOT_COL0_MASK) >>> 0;
    }

    const statLo = (bLo ^ mLo) >>> 0;
    const statHi = (bHi ^ mHi) >>> 0;

    const blockDestLo = (destLo & (wLo | statLo)) >>> 0;
    const blockDestHi = (destHi & (wHi | statHi)) >>> 0;

    let blockedSrcLo = edgeBlockedLo;
    let blockedSrcHi = edgeBlockedHi;

    if (dirCode === 0) {
      const unshiftedLo = (blockDestLo << 8) >>> 0;
      const unshiftedHi = ((blockDestHi << 8) | ((blockDestLo >>> 24) & 0xff)) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    } else if (dirCode === 1) {
      const unshiftedLo = ((blockDestLo >>> 8) | ((blockDestHi & 0xff) << 24)) >>> 0;
      const unshiftedHi = (blockDestHi >>> 8) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    } else if (dirCode === 2) {
      const unshiftedLo = ((blockDestLo << 1) & NOT_COL0_MASK) >>> 0;
      const unshiftedHi = ((blockDestHi << 1) & NOT_COL0_MASK) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    } else {
      const unshiftedLo = ((blockDestLo >>> 1) & NOT_COL7_MASK) >>> 0;
      const unshiftedHi = ((blockDestHi >>> 1) & NOT_COL7_MASK) >>> 0;
      blockedSrcLo |= unshiftedLo & mLo;
      blockedSrcHi |= unshiftedHi & mHi;
    }

    blockedSrcLo = blockedSrcLo >>> 0;
    blockedSrcHi = blockedSrcHi >>> 0;

    if (blockedSrcLo === 0 && blockedSrcHi === 0) break;

    mLo = (mLo ^ blockedSrcLo) >>> 0;
    mHi = (mHi ^ blockedSrcHi) >>> 0;
  }

  let finalDestLo = 0;
  let finalDestHi = 0;
  if (dirCode === 0) {
    finalDestLo = ((mLo >>> 8) | ((mHi & 0xff) << 24)) >>> 0;
    finalDestHi = (mHi >>> 8) >>> 0;
  } else if (dirCode === 1) {
    finalDestLo = (mLo << 8) >>> 0;
    finalDestHi = ((mHi << 8) | ((mLo >>> 24) & 0xff)) >>> 0;
  } else if (dirCode === 2) {
    finalDestLo = ((mLo >>> 1) & NOT_COL7_MASK) >>> 0;
    finalDestHi = ((mHi >>> 1) & NOT_COL7_MASK) >>> 0;
  } else {
    finalDestLo = ((mLo << 1) & NOT_COL0_MASK) >>> 0;
    finalDestHi = ((mHi << 1) & NOT_COL0_MASK) >>> 0;
  }

  const resLo = (((bLo ^ mLo) | finalDestLo) >>> 0);
  const resHi = (((bHi ^ mHi) | finalDestHi) >>> 0);

  out[0] = resLo;
  out[1] = resHi;

  return (resLo !== bLo || resHi !== bHi);
}

/**
 * High-performance Dual 32-bit SMI Bitboard Slide Engine with Zero Allocation.
 */
export function simulateMove(
  bLo: number,
  bHi: number,
  boxes: BoxState,
  walls: WallBitboard,
  dir: Direction,
  _orderIndices?: Int32Array,
  _tempPositions?: Int32Array
): TransitionResult {
  const res = moveStepBitboard(bLo, bHi, walls.lo, walls.hi, dir);

  if (res.lo === bLo && res.hi === bHi) {
    return { newState: boxes, newLo: bLo, newHi: bHi, moved: false, isPureSlide: false };
  }

  const newState = bitboardToArray({ lo: res.lo, hi: res.hi });

  return {
    newState,
    newLo: res.lo,
    newHi: res.hi,
    moved: true,
    isPureSlide: true,
  };
}

