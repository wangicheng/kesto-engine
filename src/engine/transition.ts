import { Direction, BoxState, WallBitboard, TransitionResult } from './types';
import { BOARD_SIZE } from './bitboard';
import { POS_X, POS_Y } from './heuristic';

const DIR_OFFSETS: Record<Direction, { dx: number; dy: number; offset: number }> = {
  UP: { dx: 0, dy: -1, offset: -BOARD_SIZE },
  DOWN: { dx: 0, dy: 1, offset: BOARD_SIZE },
  LEFT: { dx: -1, dy: 0, offset: -1 },
  RIGHT: { dx: 1, dy: 0, offset: 1 },
};

/**
 * High-performance Dual 32-bit SMI Bitboard Slide Engine with Zero-Allocation.
 */
export function simulateMove(
  bLo: number,
  bHi: number,
  boxes: BoxState,
  walls: WallBitboard,
  dir: Direction,
  orderIndices: Int32Array,
  tempPositions: Int32Array
): TransitionResult {
  const k = boxes.length;
  if (k === 0) {
    return { newState: boxes, newLo: 0, newHi: 0, moved: false, isPureSlide: false };
  }

  const wallLo = walls.lo;
  const wallHi = walls.hi;

  const { dx, dy, offset } = DIR_OFFSETS[dir];

  for (let i = 0; i < k; i++) {
    tempPositions[i] = boxes[i];
    orderIndices[i] = i;
  }

  // Set processing order based on movement direction (front-most boxes first)
  if (dir === 'DOWN') {
    for (let i = 0; i < k; i++) orderIndices[i] = k - 1 - i;
  } else if (dir === 'LEFT') {
    for (let i = 1; i < k; i++) {
      const key = orderIndices[i];
      const keyX = POS_X[tempPositions[key]];
      let j = i - 1;
      while (j >= 0 && POS_X[tempPositions[orderIndices[j]]] > keyX) {
        orderIndices[j + 1] = orderIndices[j];
        j--;
      }
      orderIndices[j + 1] = key;
    }
  } else if (dir === 'RIGHT') {
    for (let i = 1; i < k; i++) {
      const key = orderIndices[i];
      const keyX = POS_X[tempPositions[key]];
      let j = i - 1;
      while (j >= 0 && POS_X[tempPositions[orderIndices[j]]] < keyX) {
        orderIndices[j + 1] = orderIndices[j];
        j--;
      }
      orderIndices[j + 1] = key;
    }
  }

  let currLo = bLo >>> 0;
  let currHi = bHi >>> 0;
  let movedCount = 0;

  for (let i = 0; i < k; i++) {
    const origIdx = orderIndices[i];
    const b = tempPositions[origIdx];

    const cx = POS_X[b];
    const cy = POS_Y[b];
    const nx = cx + dx;
    const ny = cy + dy;

    // Boundary check
    if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) {
      continue;
    }

    const targetIdx = b + offset;
    const targetIsHi = targetIdx >= 32;
    const targetBit = 1 << (targetIsHi ? targetIdx - 32 : targetIdx);

    // Wall collision check
    const targetWall = targetIsHi ? wallHi : wallLo;
    if ((targetWall & targetBit) !== 0) {
      continue;
    }

    // Box collision check
    const targetBox = targetIsHi ? currHi : currLo;
    if ((targetBox & targetBit) !== 0) {
      continue;
    }

    // Valid move! Update bitboard and position
    const oldIsHi = b >= 32;
    const oldBit = 1 << (oldIsHi ? b - 32 : b);

    if (oldIsHi) {
      currHi = (currHi & ~oldBit) >>> 0;
    } else {
      currLo = (currLo & ~oldBit) >>> 0;
    }

    if (targetIsHi) {
      currHi = (currHi | targetBit) >>> 0;
    } else {
      currLo = (currLo | targetBit) >>> 0;
    }

    tempPositions[origIdx] = targetIdx;
    movedCount++;
  }

  if (movedCount === 0) {
    return { newState: boxes, newLo: bLo, newHi: bHi, moved: false, isPureSlide: false };
  }

  // Sort updated box positions (k <= 8)
  const newBoxes = new Array<number>(k);
  for (let i = 0; i < k; i++) {
    newBoxes[i] = tempPositions[i];
  }
  newBoxes.sort((a, b) => a - b);

  const isPureSlide = movedCount === k;

  return {
    newState: newBoxes,
    newLo: currLo,
    newHi: currHi,
    moved: true,
    isPureSlide,
  };
}
