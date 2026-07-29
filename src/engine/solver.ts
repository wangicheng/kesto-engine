import {
  Direction,
  BoxState,
  WallBitboard,
  SolverResult,
  SolverProgress,
} from './types';
import { arrayToHiLo } from './bitboard';
import { moveStepBitboardFast, simulateMove } from './transition';
import { FlatVisitedMap } from './flatVisitedMap';
import {
  extractRowWalls,
  extractColWalls,
  forEachPredecessor,
} from './reverseLineTable';

const DIR_NAMES: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

class StateHistory {
  public capacity: number;
  public lo: Uint32Array;
  public hi: Uint32Array;
  public parent: Int32Array;
  public dir: Uint8Array;
  public depth: Uint16Array;
  public size: number = 0;

  constructor(initialCapacity = 1 << 18) {
    this.capacity = initialCapacity;
    this.lo = new Uint32Array(this.capacity);
    this.hi = new Uint32Array(this.capacity);
    this.parent = new Int32Array(this.capacity);
    this.dir = new Uint8Array(this.capacity);
    this.depth = new Uint16Array(this.capacity);
  }

  public clear(): void {
    this.size = 0;
  }

  public add(bLo: number, bHi: number, parentId: number, dirCode: number, depthVal: number): number {
    if (this.size >= this.capacity) {
      this.grow();
    }
    const id = this.size++;
    this.lo[id] = bLo >>> 0;
    this.hi[id] = bHi >>> 0;
    this.parent[id] = parentId;
    this.dir[id] = dirCode;
    this.depth[id] = depthVal;
    return id;
  }

  private grow(): void {
    this.capacity *= 2;
    const nLo = new Uint32Array(this.capacity); nLo.set(this.lo); this.lo = nLo;
    const nHi = new Uint32Array(this.capacity); nHi.set(this.hi); this.hi = nHi;
    const nParent = new Int32Array(this.capacity); nParent.set(this.parent); this.parent = nParent;
    const nDir = new Uint8Array(this.capacity); nDir.set(this.dir); this.dir = nDir;
    const nDepth = new Uint16Array(this.capacity); nDepth.set(this.depth); this.depth = nDepth;
  }
}

function getGoalStates(targets: number[], boxCount: number): { lo: number; hi: number }[] {
  if (boxCount <= 0 || boxCount > targets.length) return [];
  const goals: { lo: number; hi: number }[] = [];

  const visit = (start: number, remaining: number, curLo: number, curHi: number) => {
    if (remaining === 0) {
      goals.push({ lo: curLo >>> 0, hi: curHi >>> 0 });
      return;
    }
    const lastStart = targets.length - remaining;
    for (let i = start; i <= lastStart; i++) {
      const cell = targets[i];
      let nLo = curLo;
      let nHi = curHi;
      if (cell < 32) nLo |= 1 << cell;
      else nHi |= 1 << (cell - 32);
      visit(i + 1, remaining - 1, nLo, nHi);
    }
  };

  visit(0, boxCount, 0, 0);
  return goals;
}

export interface SolverOptions {
  maxNodes?: number;
  timeLimitMs?: number;
  batchSize?: number; // Nodes to expand per async frame yield
  onProgress?: (progress: SolverProgress) => void;
}

export class KestoSolver {
  private isCancelled = false;

  // Reusable scratch buffers per solver instance for zero-allocation slide computations
  private orderIndices = new Int32Array(64);
  private tempPositions = new Int32Array(64);
  private nextScratch = new Uint32Array(2);

  private forwardVisited = new FlatVisitedMap();
  private backwardVisited = new FlatVisitedMap();
  private forwardHistory = new StateHistory();
  private backwardHistory = new StateHistory();

  private forwardFrontierCurr = new Int32Array(1 << 18);
  private forwardFrontierNext = new Int32Array(1 << 18);
  private backwardFrontierCurr = new Int32Array(1 << 18);
  private backwardFrontierNext = new Int32Array(1 << 18);

  public cancel(): void {
    this.isCancelled = true;
  }

  private ensureFrontierCapacity(arr: Int32Array, required: number): any {
    if (required >= arr.length) {
      const next = new Int32Array(arr.length * 2);
      next.set(arr as any);
      return next;
    }
    return arr;
  }

  /**
   * Synchronous Bidirectional Search solver execution.
   */
  public solve(
    initialBoxes: BoxState,
    walls: WallBitboard,
    targets: number[],
    options: SolverOptions = {}
  ): SolverResult {
    const startTime = performance.now();
    const maxNodes = options.maxNodes ?? Infinity;
    const timeLimitMs = options.timeLimitMs ?? Infinity;

    if (initialBoxes.length === 0 || targets.length === 0 || initialBoxes.length !== targets.length) {
      return {
        success: false,
        solutionMoves: [],
        solutionStates: [],
        totalSteps: 0,
        nodesExpanded: 0,
        visitedCount: 0,
        executionTimeMs: performance.now() - startTime,
      };
    }

    const initialSorted = [...initialBoxes].sort((a, b) => a - b);
    const { lo: initLo, hi: initHi } = arrayToHiLo(initialSorted);

    const goals = getGoalStates(targets, initialBoxes.length);
    if (goals.length === 0) {
      return {
        success: false,
        solutionMoves: [],
        solutionStates: [],
        totalSteps: 0,
        nodesExpanded: 0,
        visitedCount: 0,
        executionTimeMs: performance.now() - startTime,
      };
    }

    const rowWalls = extractRowWalls(walls);
    const colWalls = extractColWalls(walls);

    this.forwardVisited.clear();
    this.backwardVisited.clear();
    this.forwardHistory.clear();
    this.backwardHistory.clear();

    const fInitId = this.forwardHistory.add(initLo, initHi, -1, 0, 0);
    this.forwardVisited.set(initLo, initHi, fInitId);

    this.forwardFrontierCurr[0] = fInitId;
    let fCountCurr = 1;
    let fCountNext = 0;

    let bCountCurr = 0;
    let bCountNext = 0;

    for (const g of goals) {
      if (this.forwardVisited.get(g.lo, g.hi) !== -1) {
        return {
          success: true,
          solutionMoves: [],
          solutionStates: [initialSorted],
          totalSteps: 0,
          nodesExpanded: 0,
          visitedCount: 1,
          executionTimeMs: performance.now() - startTime,
        };
      }
      const bId = this.backwardHistory.add(g.lo, g.hi, -1, 0, 0);
      this.backwardVisited.set(g.lo, g.hi, bId);
      this.backwardFrontierCurr = this.ensureFrontierCapacity(this.backwardFrontierCurr, bCountCurr + 1);
      this.backwardFrontierCurr[bCountCurr++] = bId;
    }

    let fDepth = 0;
    let bDepth = 0;
    let bestLen = Infinity;
    let bestMeetF = -1;
    let bestMeetB = -1;

    let nodesExpanded = 0;

    const rememberBest = (fId: number, bId: number, len: number) => {
      if (len < bestLen) {
        bestLen = len;
        bestMeetF = fId;
        bestMeetB = bId;
      }
    };

    while (fCountCurr > 0 && bCountCurr > 0) {
      if (bestMeetF !== -1 && fDepth + bDepth + 1 >= bestLen) {
        return this.reconstructPath(
          initialSorted,
          walls,
          bestMeetF,
          bestMeetB,
          nodesExpanded,
          this.forwardVisited.size + this.backwardVisited.size,
          performance.now() - startTime
        );
      }

      if (nodesExpanded > maxNodes || performance.now() - startTime > timeLimitMs) {
        break;
      }

      const expandForward = fCountCurr <= bCountCurr;

      if (expandForward) {
        fCountNext = 0;
        const nextDepth = fDepth + 1;

        for (let i = 0; i < fCountCurr; i++) {
          const currId = this.forwardFrontierCurr[i];
          const cLo = this.forwardHistory.lo[currId];
          const cHi = this.forwardHistory.hi[currId];

          for (let dirCode = 0; dirCode < 4; dirCode++) {
            const moved = moveStepBitboardFast(cLo, cHi, walls.lo, walls.hi, dirCode, this.nextScratch);
            if (!moved) continue;

            nodesExpanded++;

            const nLo = this.nextScratch[0];
            const nHi = this.nextScratch[1];

            if (this.forwardVisited.get(nLo, nHi) !== -1) continue;

            const newId = this.forwardHistory.add(nLo, nHi, currId, dirCode, nextDepth);
            this.forwardVisited.set(nLo, nHi, newId);

            const bId = this.backwardVisited.get(nLo, nHi);
            if (bId !== -1) {
              rememberBest(newId, bId, nextDepth + this.backwardHistory.depth[bId]);
            }

            this.forwardFrontierNext = this.ensureFrontierCapacity(this.forwardFrontierNext, fCountNext + 1);
            this.forwardFrontierNext[fCountNext++] = newId;
          }
        }

        const tmp = this.forwardFrontierCurr;
        this.forwardFrontierCurr = this.forwardFrontierNext;
        this.forwardFrontierNext = tmp;

        fCountCurr = fCountNext;
        fDepth = nextDepth;
      } else {
        bCountNext = 0;
        const nextDepth = bDepth + 1;

        for (let i = 0; i < bCountCurr; i++) {
          const currId = this.backwardFrontierCurr[i];
          const cLo = this.backwardHistory.lo[currId];
          const cHi = this.backwardHistory.hi[currId];

          for (let dirCode = 0; dirCode < 4; dirCode++) {
            const dirName = DIR_NAMES[dirCode];
            forEachPredecessor(
              cLo,
              cHi,
              rowWalls,
              colWalls,
              dirName,
              (pLo, pHi) => {
                nodesExpanded++;
                if (this.backwardVisited.get(pLo, pHi) !== -1) return true;

                const newId = this.backwardHistory.add(pLo, pHi, currId, dirCode, nextDepth);
                this.backwardVisited.set(pLo, pHi, newId);

                const fId = this.forwardVisited.get(pLo, pHi);
                if (fId !== -1) {
                  rememberBest(fId, newId, nextDepth + this.forwardHistory.depth[fId]);
                }

                this.backwardFrontierNext = this.ensureFrontierCapacity(this.backwardFrontierNext, bCountNext + 1);
                this.backwardFrontierNext[bCountNext++] = newId;
                return true;
              }
            );
          }
        }

        const tmp = this.backwardFrontierCurr;
        this.backwardFrontierCurr = this.backwardFrontierNext;
        this.backwardFrontierNext = tmp;

        bCountCurr = bCountNext;
        bDepth = nextDepth;
      }
    }

    if (bestMeetF !== -1) {
      return this.reconstructPath(
        initialSorted,
        walls,
        bestMeetF,
        bestMeetB,
        nodesExpanded,
        this.forwardVisited.size + this.backwardVisited.size,
        performance.now() - startTime
      );
    }

    return {
      success: false,
      solutionMoves: [],
      solutionStates: [],
      totalSteps: 0,
      nodesExpanded,
      visitedCount: this.forwardVisited.size + this.backwardVisited.size,
      executionTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Asynchronous Bidirectional Search solver execution with UI time-slicing and live telemetry callbacks.
   */
  public async solveAsync(
    initialBoxes: BoxState,
    walls: WallBitboard,
    targets: number[],
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    this.isCancelled = false;
    const startTime = performance.now();
    const maxNodes = options.maxNodes ?? Infinity;
    const timeLimitMs = options.timeLimitMs ?? Infinity;

    if (initialBoxes.length === 0 || targets.length === 0 || initialBoxes.length !== targets.length) {
      const executionTimeMs = performance.now() - startTime;
      options.onProgress?.({
        nodesExpanded: 0,
        openSetSize: 0,
        visitedCount: 0,
        executionTimeMs,
        status: 'UNSOLVABLE',
      });
      return {
        success: false,
        solutionMoves: [],
        solutionStates: [],
        totalSteps: 0,
        nodesExpanded: 0,
        visitedCount: 0,
        executionTimeMs,
      };
    }

    const initialSorted = [...initialBoxes].sort((a, b) => a - b);
    const { lo: initLo, hi: initHi } = arrayToHiLo(initialSorted);

    const goals = getGoalStates(targets, initialBoxes.length);
    if (goals.length === 0) {
      const executionTimeMs = performance.now() - startTime;
      options.onProgress?.({
        nodesExpanded: 0,
        openSetSize: 0,
        visitedCount: 0,
        executionTimeMs,
        status: 'UNSOLVABLE',
      });
      return {
        success: false,
        solutionMoves: [],
        solutionStates: [],
        totalSteps: 0,
        nodesExpanded: 0,
        visitedCount: 0,
        executionTimeMs,
      };
    }

    const rowWalls = extractRowWalls(walls);
    const colWalls = extractColWalls(walls);

    this.forwardVisited.clear();
    this.backwardVisited.clear();
    this.forwardHistory.clear();
    this.backwardHistory.clear();

    const fInitId = this.forwardHistory.add(initLo, initHi, -1, 0, 0);
    this.forwardVisited.set(initLo, initHi, fInitId);

    this.forwardFrontierCurr[0] = fInitId;
    let fCountCurr = 1;
    let fCountNext = 0;

    let bCountCurr = 0;
    let bCountNext = 0;

    for (const g of goals) {
      if (this.forwardVisited.get(g.lo, g.hi) !== -1) {
        const executionTimeMs = performance.now() - startTime;
        options.onProgress?.({
          nodesExpanded: 0,
          openSetSize: 0,
          visitedCount: 1,
          executionTimeMs,
          status: 'SOLVED',
          currentStep: 0,
        });
        return {
          success: true,
          solutionMoves: [],
          solutionStates: [initialSorted],
          totalSteps: 0,
          nodesExpanded: 0,
          visitedCount: 1,
          executionTimeMs,
        };
      }
      const bId = this.backwardHistory.add(g.lo, g.hi, -1, 0, 0);
      this.backwardVisited.set(g.lo, g.hi, bId);
      this.backwardFrontierCurr = this.ensureFrontierCapacity(this.backwardFrontierCurr, bCountCurr + 1);
      this.backwardFrontierCurr[bCountCurr++] = bId;
    }

    let fDepth = 0;
    let bDepth = 0;
    let bestLen = Infinity;
    let bestMeetF = -1;
    let bestMeetB = -1;

    let nodesExpanded = 0;
    let lastProgressReport = performance.now();

    const rememberBest = (fId: number, bId: number, len: number) => {
      if (len < bestLen) {
        bestLen = len;
        bestMeetF = fId;
        bestMeetB = bId;
      }
    };

    const checkProgress = async () => {
      const now = performance.now();
      if (now - lastProgressReport >= 200) {
        lastProgressReport = now;
        options.onProgress?.({
          nodesExpanded,
          openSetSize: fCountCurr + bCountCurr,
          visitedCount: this.forwardVisited.size + this.backwardVisited.size,
          executionTimeMs: now - startTime,
          status: 'SEARCHING',
          currentStep: fDepth + bDepth,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };

    while (fCountCurr > 0 && bCountCurr > 0) {
      if (this.isCancelled) {
        return {
          success: false,
          solutionMoves: [],
          solutionStates: [],
          totalSteps: 0,
          nodesExpanded,
          visitedCount: this.forwardVisited.size + this.backwardVisited.size,
          executionTimeMs: performance.now() - startTime,
        };
      }

      if (bestMeetF !== -1 && fDepth + bDepth + 1 >= bestLen) {
        const executionTimeMs = performance.now() - startTime;
        options.onProgress?.({
          nodesExpanded,
          openSetSize: fCountCurr + bCountCurr,
          visitedCount: this.forwardVisited.size + this.backwardVisited.size,
          executionTimeMs,
          status: 'SOLVED',
          currentStep: bestLen,
        });
        return this.reconstructPath(
          initialSorted,
          walls,
          bestMeetF,
          bestMeetB,
          nodesExpanded,
          this.forwardVisited.size + this.backwardVisited.size,
          executionTimeMs
        );
      }

      if (nodesExpanded > maxNodes || performance.now() - startTime > timeLimitMs) {
        break;
      }

      const expandForward = fCountCurr <= bCountCurr;

      if (expandForward) {
        fCountNext = 0;
        const nextDepth = fDepth + 1;

        for (let i = 0; i < fCountCurr; i++) {
          const currId = this.forwardFrontierCurr[i];
          const cLo = this.forwardHistory.lo[currId];
          const cHi = this.forwardHistory.hi[currId];

          for (let dirCode = 0; dirCode < 4; dirCode++) {
            const moved = moveStepBitboardFast(cLo, cHi, walls.lo, walls.hi, dirCode, this.nextScratch);
            if (!moved) continue;

            nodesExpanded++;

            if ((nodesExpanded & 8191) === 0) {
              await checkProgress();
            }

            const nLo = this.nextScratch[0];
            const nHi = this.nextScratch[1];

            if (this.forwardVisited.get(nLo, nHi) !== -1) continue;

            const newId = this.forwardHistory.add(nLo, nHi, currId, dirCode, nextDepth);
            this.forwardVisited.set(nLo, nHi, newId);

            const bId = this.backwardVisited.get(nLo, nHi);
            if (bId !== -1) {
              rememberBest(newId, bId, nextDepth + this.backwardHistory.depth[bId]);
            }

            this.forwardFrontierNext = this.ensureFrontierCapacity(this.forwardFrontierNext, fCountNext + 1);
            this.forwardFrontierNext[fCountNext++] = newId;
          }
        }

        const tmp = this.forwardFrontierCurr;
        this.forwardFrontierCurr = this.forwardFrontierNext;
        this.forwardFrontierNext = tmp;

        fCountCurr = fCountNext;
        fDepth = nextDepth;
      } else {
        bCountNext = 0;
        const nextDepth = bDepth + 1;

        for (let i = 0; i < bCountCurr; i++) {
          const currId = this.backwardFrontierCurr[i];
          const cLo = this.backwardHistory.lo[currId];
          const cHi = this.backwardHistory.hi[currId];

          for (let dirCode = 0; dirCode < 4; dirCode++) {
            const dirName = DIR_NAMES[dirCode];
            forEachPredecessor(
              cLo,
              cHi,
              rowWalls,
              colWalls,
              dirName,
              (pLo, pHi) => {
                nodesExpanded++;
                if (this.backwardVisited.get(pLo, pHi) !== -1) return true;

                const newId = this.backwardHistory.add(pLo, pHi, currId, dirCode, nextDepth);
                this.backwardVisited.set(pLo, pHi, newId);

                const fId = this.forwardVisited.get(pLo, pHi);
                if (fId !== -1) {
                  rememberBest(fId, newId, nextDepth + this.forwardHistory.depth[fId]);
                }

                this.backwardFrontierNext = this.ensureFrontierCapacity(this.backwardFrontierNext, bCountNext + 1);
                this.backwardFrontierNext[bCountNext++] = newId;
                return true;
              }
            );
          }

          if ((nodesExpanded & 8191) === 0) {
            await checkProgress();
          }
        }

        const tmp = this.backwardFrontierCurr;
        this.backwardFrontierCurr = this.backwardFrontierNext;
        this.backwardFrontierNext = tmp;

        bCountCurr = bCountNext;
        bDepth = nextDepth;
      }

      await checkProgress();
    }

    if (bestMeetF !== -1) {
      const executionTimeMs = performance.now() - startTime;
      options.onProgress?.({
        nodesExpanded,
        openSetSize: fCountCurr + bCountCurr,
        visitedCount: this.forwardVisited.size + this.backwardVisited.size,
        executionTimeMs,
        status: 'SOLVED',
        currentStep: bestLen,
      });
      return this.reconstructPath(
        initialSorted,
        walls,
        bestMeetF,
        bestMeetB,
        nodesExpanded,
        this.forwardVisited.size + this.backwardVisited.size,
        executionTimeMs
      );
    }

    const executionTimeMs = performance.now() - startTime;
    options.onProgress?.({
      nodesExpanded,
      openSetSize: 0,
      visitedCount: this.forwardVisited.size + this.backwardVisited.size,
      executionTimeMs,
      status: 'UNSOLVABLE',
    });

    return {
      success: false,
      solutionMoves: [],
      solutionStates: [],
      totalSteps: 0,
      nodesExpanded,
      visitedCount: this.forwardVisited.size + this.backwardVisited.size,
      executionTimeMs,
    };
  }

  private reconstructPath(
    initialSorted: BoxState,
    walls: WallBitboard,
    meetFId: number,
    meetBId: number,
    nodesExpanded: number,
    visitedCount: number,
    executionTimeMs: number
  ): SolverResult {
    const fMoves: Direction[] = [];
    let curF = meetFId;

    while (this.forwardHistory.parent[curF] !== -1) {
      fMoves.push(DIR_NAMES[this.forwardHistory.dir[curF]]);
      curF = this.forwardHistory.parent[curF];
    }
    fMoves.reverse();

    const bMoves: Direction[] = [];
    let curB = meetBId;

    while (this.backwardHistory.parent[curB] !== -1) {
      bMoves.push(DIR_NAMES[this.backwardHistory.dir[curB]]);
      curB = this.backwardHistory.parent[curB];
    }

    const solutionMoves = fMoves.concat(bMoves);

    // Reconstruct solution states by simulating forward from initial state
    const solutionStates: BoxState[] = [initialSorted];
    let curBoxes = initialSorted;
    let curLoBit = arrayToHiLo(initialSorted).lo;
    let curHiBit = arrayToHiLo(initialSorted).hi;

    for (const action of solutionMoves) {
      const res = simulateMove(
        curLoBit,
        curHiBit,
        curBoxes,
        walls,
        action,
        this.orderIndices,
        this.tempPositions
      );
      curBoxes = res.newState;
      curLoBit = res.newLo;
      curHiBit = res.newHi;
      solutionStates.push(curBoxes);
    }

    return {
      success: true,
      solutionMoves,
      solutionStates,
      totalSteps: solutionMoves.length,
      nodesExpanded,
      visitedCount,
      executionTimeMs,
    };
  }
}

