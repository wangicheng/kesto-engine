import { Direction, WallBitboard } from './types';

// Precomputed 256x256 lookup tables for 8-bit line shifts
// table[lineDir][wall * 256 + resultBits] = number[] (array of pre-move bits)
// lineDir = 2 (LEFT/UP: decreasing index), 3 (RIGHT/DOWN: increasing index)
let REVERSE_LINE_TABLE: (number[][] | null)[] | null = null;

let ROW_BOARDS_LO = new Uint32Array(2048);
let ROW_BOARDS_HI = new Uint32Array(2048);
let COL_BOARDS_LO = new Uint32Array(2048);
let COL_BOARDS_HI = new Uint32Array(2048);

let LINE_BITBOARDS: {
  rows: { lo: number; hi: number }[][];
  cols: { lo: number; hi: number }[][];
} | null = null;

function stepLineBits(bits: number, walls: number, dir: number): number {
  let moving = bits & ~walls;

  for (let iter = 0; iter < 8; iter++) {
    let blocked = 0;
    const stationary = bits ^ moving;

    for (let i = 0; i < 8; i++) {
      const bit = 1 << i;
      if ((moving & bit) === 0) continue;

      const next = dir === 2 ? i - 1 : i + 1;
      if (next < 0 || next >= 8) {
        blocked |= bit;
        continue;
      }

      const nextBit = 1 << next;
      if ((walls & nextBit) || (stationary & nextBit)) {
        blocked |= bit;
      }
    }

    if (blocked === 0) break;
    moving ^= blocked;
  }

  let out = bits ^ moving;
  for (let i = 0; i < 8; i++) {
    const bit = 1 << i;
    if ((moving & bit) === 0) continue;
    out |= 1 << (dir === 2 ? i - 1 : i + 1);
  }

  return out & 0xff;
}

export function getReverseLineTable() {
  if (REVERSE_LINE_TABLE) return REVERSE_LINE_TABLE;

  const table: (number[][] | null)[] = [null, null, new Array(256 * 256), new Array(256 * 256)];
  for (let dir = 2; dir <= 3; dir++) {
    const dirTable = table[dir]!;
    for (let wall = 0; wall < 256; wall++) {
      for (let result = 0; result < 256; result++) {
        dirTable[wall * 256 + result] = [];
      }

      for (let bits = 0; bits < 256; bits++) {
        if (bits & wall) continue;
        const result = stepLineBits(bits, wall, dir);
        dirTable[wall * 256 + result]!.push(bits);
      }
    }
  }

  REVERSE_LINE_TABLE = table;
  return table;
}

export function getLineBitboards() {
  if (LINE_BITBOARDS) return LINE_BITBOARDS;

  const rows: { lo: number; hi: number }[][] = Array.from({ length: 8 }, () => new Array(256));
  const cols: { lo: number; hi: number }[][] = Array.from({ length: 8 }, () => new Array(256));

  for (let line = 0; line < 8; line++) {
    for (let bits = 0; bits < 256; bits++) {
      let rLo = 0;
      let rHi = 0;
      let cLo = 0;
      let cHi = 0;

      for (let i = 0; i < 8; i++) {
        if ((bits & (1 << i)) === 0) continue;

        // Row line
        const rIdx = line * 8 + i;
        if (rIdx < 32) rLo |= (1 << rIdx) >>> 0;
        else rHi |= (1 << (rIdx - 32)) >>> 0;

        // Col line
        const cIdx = i * 8 + line;
        if (cIdx < 32) cLo |= (1 << cIdx) >>> 0;
        else cHi |= (1 << (cIdx - 32)) >>> 0;
      }

      rLo = rLo >>> 0;
      rHi = rHi >>> 0;
      cLo = cLo >>> 0;
      cHi = cHi >>> 0;

      rows[line][bits] = { lo: rLo, hi: rHi };
      cols[line][bits] = { lo: cLo, hi: cHi };

      const flatIdx = (line << 8) | bits;
      ROW_BOARDS_LO[flatIdx] = rLo;
      ROW_BOARDS_HI[flatIdx] = rHi;
      COL_BOARDS_LO[flatIdx] = cLo;
      COL_BOARDS_HI[flatIdx] = cHi;
    }
  }

  LINE_BITBOARDS = { rows, cols };
  return LINE_BITBOARDS;
}

export function extractRowWalls(walls: WallBitboard): Uint8Array {
  const rowWalls = new Uint8Array(8);
  for (let r = 0; r < 4; r++) {
    rowWalls[r] = (walls.lo >>> (r * 8)) & 0xff;
  }
  for (let r = 4; r < 8; r++) {
    rowWalls[r] = (walls.hi >>> ((r - 4) * 8)) & 0xff;
  }
  return rowWalls;
}

export function extractColWalls(walls: WallBitboard): Uint8Array {
  const colWalls = new Uint8Array(8);
  for (let c = 0; c < 8; c++) {
    let mask = 0;
    for (let r = 0; r < 4; r++) {
      if ((walls.lo >>> (r * 8 + c)) & 1) mask |= 1 << r;
    }
    for (let r = 4; r < 8; r++) {
      if ((walls.hi >>> ((r - 4) * 8 + c)) & 1) mask |= 1 << r;
    }
    colWalls[c] = mask;
  }
  return colWalls;
}

export function getRowBits(lo: number, hi: number, row: number): number {
  if (row < 4) return (lo >>> (row * 8)) & 0xff;
  return (hi >>> ((row - 4) * 8)) & 0xff;
}

export function getColBits(lo: number, hi: number, col: number): number {
  let mask = 0;
  for (let r = 0; r < 4; r++) {
    if ((lo >>> (r * 8 + col)) & 1) mask |= 1 << r;
  }
  for (let r = 4; r < 8; r++) {
    if ((hi >>> ((r - 4) * 8 + col)) & 1) mask |= 1 << r;
  }
  return mask;
}

const STATIC_CHOICES: (number[] | null)[] = [null, null, null, null, null, null, null, null];

/**
 * Iterates through all valid predecessor states (prevLo, prevHi) that can move via `dir` into `(lo, hi)`.
 */
export function forEachPredecessor(
  lo: number,
  hi: number,
  rowWalls: Uint8Array,
  colWalls: Uint8Array,
  dir: Direction,
  visit: (prevLo: number, prevHi: number) => boolean | void
): boolean {
  const table = getReverseLineTable();
  getLineBitboards(); // Ensure flat boards populated

  const lineDir = dir === 'LEFT' || dir === 'UP' ? 2 : 3;
  const dirTable = table[lineDir]!;

  if (dir === 'LEFT' || dir === 'RIGHT') {
    for (let row = 0; row < 8; row++) {
      const resultBits = getRowBits(lo, hi, row);
      const rowChoices = dirTable[rowWalls[row] * 256 + resultBits];
      if (!rowChoices || rowChoices.length === 0) return true;
      STATIC_CHOICES[row] = rowChoices;
    }

    const c0 = STATIC_CHOICES[0]!, c1 = STATIC_CHOICES[1]!, c2 = STATIC_CHOICES[2]!, c3 = STATIC_CHOICES[3]!;
    const c4 = STATIC_CHOICES[4]!, c5 = STATIC_CHOICES[5]!, c6 = STATIC_CHOICES[6]!, c7 = STATIC_CHOICES[7]!;

    for (let i0 = 0; i0 < c0.length; i0++) {
      const o0 = c0[i0];
      const b0_lo = ROW_BOARDS_LO[o0], b0_hi = ROW_BOARDS_HI[o0];
      for (let i1 = 0; i1 < c1.length; i1++) {
        const o1 = 256 | c1[i1];
        const b1_lo = b0_lo | ROW_BOARDS_LO[o1], b1_hi = b0_hi | ROW_BOARDS_HI[o1];
        for (let i2 = 0; i2 < c2.length; i2++) {
          const o2 = 512 | c2[i2];
          const b2_lo = b1_lo | ROW_BOARDS_LO[o2], b2_hi = b1_hi | ROW_BOARDS_HI[o2];
          for (let i3 = 0; i3 < c3.length; i3++) {
            const o3 = 768 | c3[i3];
            const b3_lo = b2_lo | ROW_BOARDS_LO[o3], b3_hi = b2_hi | ROW_BOARDS_HI[o3];
            for (let i4 = 0; i4 < c4.length; i4++) {
              const o4 = 1024 | c4[i4];
              const b4_lo = b3_lo | ROW_BOARDS_LO[o4], b4_hi = b3_hi | ROW_BOARDS_HI[o4];
              for (let i5 = 0; i5 < c5.length; i5++) {
                const o5 = 1280 | c5[i5];
                const b5_lo = b4_lo | ROW_BOARDS_LO[o5], b5_hi = b4_hi | ROW_BOARDS_HI[o5];
                for (let i6 = 0; i6 < c6.length; i6++) {
                  const o6 = 1536 | c6[i6];
                  const b6_lo = b5_lo | ROW_BOARDS_LO[o6], b6_hi = b5_hi | ROW_BOARDS_HI[o6];
                  for (let i7 = 0; i7 < c7.length; i7++) {
                    const o7 = 1792 | c7[i7];
                    const prevLo = (b6_lo | ROW_BOARDS_LO[o7]) >>> 0;
                    const prevHi = (b6_hi | ROW_BOARDS_HI[o7]) >>> 0;
                    if (visit(prevLo, prevHi) === false) return false;
                  }
                }
              }
            }
          }
        }
      }
    }
    return true;
  } else {
    // UP or DOWN
    for (let col = 0; col < 8; col++) {
      const resultBits = getColBits(lo, hi, col);
      const colChoices = dirTable[colWalls[col] * 256 + resultBits];
      if (!colChoices || colChoices.length === 0) return true;
      STATIC_CHOICES[col] = colChoices;
    }

    const c0 = STATIC_CHOICES[0]!, c1 = STATIC_CHOICES[1]!, c2 = STATIC_CHOICES[2]!, c3 = STATIC_CHOICES[3]!;
    const c4 = STATIC_CHOICES[4]!, c5 = STATIC_CHOICES[5]!, c6 = STATIC_CHOICES[6]!, c7 = STATIC_CHOICES[7]!;

    for (let i0 = 0; i0 < c0.length; i0++) {
      const o0 = c0[i0];
      const b0_lo = COL_BOARDS_LO[o0], b0_hi = COL_BOARDS_HI[o0];
      for (let i1 = 0; i1 < c1.length; i1++) {
        const o1 = 256 | c1[i1];
        const b1_lo = b0_lo | COL_BOARDS_LO[o1], b1_hi = b0_hi | COL_BOARDS_HI[o1];
        for (let i2 = 0; i2 < c2.length; i2++) {
          const o2 = 512 | c2[i2];
          const b2_lo = b1_lo | COL_BOARDS_LO[o2], b2_hi = b1_hi | COL_BOARDS_HI[o2];
          for (let i3 = 0; i3 < c3.length; i3++) {
            const o3 = 768 | c3[i3];
            const b3_lo = b2_lo | COL_BOARDS_LO[o3], b3_hi = b2_hi | COL_BOARDS_HI[o3];
            for (let i4 = 0; i4 < c4.length; i4++) {
              const o4 = 1024 | c4[i4];
              const b4_lo = b3_lo | COL_BOARDS_LO[o4], b4_hi = b3_hi | COL_BOARDS_HI[o4];
              for (let i5 = 0; i5 < c5.length; i5++) {
                const o5 = 1280 | c5[i5];
                const b5_lo = b4_lo | COL_BOARDS_LO[o5], b5_hi = b4_hi | COL_BOARDS_HI[o5];
                for (let i6 = 0; i6 < c6.length; i6++) {
                  const o6 = 1536 | c6[i6];
                  const b6_lo = b5_lo | COL_BOARDS_LO[o6], b6_hi = b5_hi | COL_BOARDS_HI[o6];
                  for (let i7 = 0; i7 < c7.length; i7++) {
                    const o7 = 1792 | c7[i7];
                    const prevLo = (b6_lo | COL_BOARDS_LO[o7]) >>> 0;
                    const prevHi = (b6_hi | COL_BOARDS_HI[o7]) >>> 0;
                    if (visit(prevLo, prevHi) === false) return false;
                  }
                }
              }
            }
          }
        }
      }
    }
    return true;
  }
}

