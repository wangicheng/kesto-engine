import {
  Direction,
  BoxState,
  WallBitboard,
  SearchNode,
  SolverResult,
  SolverProgress,
} from './types';
import { arrayToHiLo } from './bitboard';
import { simulateMove } from './transition';
import { calculateHeuristic, isGoalReached, LevelHeuristicContext, HeuristicMode } from './heuristic';
import { BucketPriorityQueue } from './priorityQueue';
import { FlatVisitedMap } from './flatVisitedMap';

const TIE_BREAKER_WEIGHT = 0.0001;

function calculatePriority(f: number, h: number): number {
  return f + h * TIE_BREAKER_WEIGHT;
}

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

export interface SolverOptions {
  maxNodes?: number;
  timeLimitMs?: number;
  batchSize?: number; // Nodes to expand per async frame yield
  heuristicMode?: HeuristicMode; // 'perm' (k<=6 algorithm) | 'hungarian' (k>=7 algorithm) | 'auto'
  onProgress?: (progress: SolverProgress) => void;
}

export class KestoSolver {
  private isCancelled = false;

  // Reusable scratch buffers per solver instance for zero-allocation slide computations
  private orderIndices = new Int32Array(64);
  private tempPositions = new Int32Array(64);

  public cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Synchronous solver execution.
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

    const context = new LevelHeuristicContext(walls, targets);
    const initialSorted = [...initialBoxes].sort((a, b) => a - b);
    if (context.hasUnreachableBox(initialSorted)) {
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
    const { lo: initLo, hi: initHi } = arrayToHiLo(initialSorted);
    const initialH = calculateHeuristic(initialSorted, targets, context, options.heuristicMode);

    const openList = new BucketPriorityQueue();
    const visited = new FlatVisitedMap();

    const startNode: SearchNode = {
      state: initialSorted,
      lo: initLo,
      hi: initHi,
      g: 0,
      h: initialH,
      f: initialH,
      priority: calculatePriority(initialH, initialH),
      isPureSlide: false,
      parent: null,
      action: null,
    };

    openList.push(startNode);
    visited.set(initLo, initHi, 0);

    let nodesExpanded = 0;

    while (!openList.isEmpty()) {
      const current = openList.pop()!;
      nodesExpanded++;

      // Check optional timeout or node limit
      if (
        (maxNodes !== Infinity && nodesExpanded > maxNodes) ||
        (timeLimitMs !== Infinity && performance.now() - startTime > timeLimitMs)
      ) {
        break;
      }

      // Fast O(1) Goal test using native Uint32 lo and hi comparison
      if (isGoalReached(current.lo, current.hi, context.targetLo, context.targetHi)) {
        const executionTimeMs = performance.now() - startTime;
        return this.reconstructPath(current, nodesExpanded, visited.size, executionTimeMs);
      }

      // Expand directions
      for (const dir of DIRECTIONS) {
        // Early Reversal Bypass: Skip immediate opposite move if parent move was a pure un-blocked slide
        const parentAction = current.action;
        if (parentAction !== null && current.isPureSlide && dir === OPPOSITE[parentAction]) {
          continue;
        }

        const { newState, newLo, newHi, moved, isPureSlide } = simulateMove(
          current.lo,
          current.hi,
          current.state,
          walls,
          dir,
          this.orderIndices,
          this.tempPositions
        );
        if (!moved) continue;

        const newG = current.g + 1;

        const prevMinG = visited.get(newLo, newHi);
        if (prevMinG !== -1 && newG >= prevMinG) {
          continue;
        }

        visited.set(newLo, newHi, newG);

        const nextH = calculateHeuristic(newState, targets, context, options.heuristicMode);
        const f = newG + nextH;
        const childNode: SearchNode = {
          state: newState,
          lo: newLo,
          hi: newHi,
          g: newG,
          h: nextH,
          f,
          priority: calculatePriority(f, nextH),
          isPureSlide,
          parent: current,
          action: dir,
        };

        openList.push(childNode);
      }
    }

    const executionTimeMs = performance.now() - startTime;
    return {
      success: false,
      solutionMoves: [],
      solutionStates: [],
      totalSteps: 0,
      nodesExpanded,
      visitedCount: visited.size,
      executionTimeMs,
    };
  }

  /**
   * Asynchronous solver execution with UI time-slicing and live telemetry progress callbacks.
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
    const batchSize = options.batchSize ?? 1200;

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

    const context = new LevelHeuristicContext(walls, targets);
    const initialSorted = [...initialBoxes].sort((a, b) => a - b);
    if (context.hasUnreachableBox(initialSorted)) {
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
    const { lo: initLo, hi: initHi } = arrayToHiLo(initialSorted);
    const initialH = calculateHeuristic(initialSorted, targets, context, options.heuristicMode);

    const openList = new BucketPriorityQueue();
    const visited = new FlatVisitedMap();

    const startNode: SearchNode = {
      state: initialSorted,
      lo: initLo,
      hi: initHi,
      g: 0,
      h: initialH,
      f: initialH,
      priority: calculatePriority(initialH, initialH),
      isPureSlide: false,
      parent: null,
      action: null,
    };

    openList.push(startNode);
    visited.set(initLo, initHi, 0);

    let nodesExpanded = 0;
    let lastProgressReport = performance.now();

    let maxKnownDepth = 0;

    while (!openList.isEmpty()) {
      if (this.isCancelled) {
        return {
          success: false,
          solutionMoves: [],
          solutionStates: [],
          totalSteps: 0,
          nodesExpanded,
          visitedCount: visited.size,
          executionTimeMs: performance.now() - startTime,
        };
      }

      const current = openList.pop()!;
      nodesExpanded++;

      // Fast O(1) Goal test using native Uint32 lo and hi comparison
      if (isGoalReached(current.lo, current.hi, context.targetLo, context.targetHi)) {
        const executionTimeMs = performance.now() - startTime;
        options.onProgress?.({
          nodesExpanded,
          openSetSize: openList.size,
          visitedCount: visited.size,
          executionTimeMs,
          status: 'SOLVED',
          currentStep: current.g,
        });
        return this.reconstructPath(current, nodesExpanded, visited.size, executionTimeMs);
      }

      // Expand 4 directions
      for (const dir of DIRECTIONS) {
        // Early Reversal Bypass: Skip immediate opposite move if parent move was a pure un-blocked slide
        const parentAction = current.action;
        if (parentAction !== null && current.isPureSlide && dir === OPPOSITE[parentAction]) {
          continue;
        }

        const { newState, newLo, newHi, moved, isPureSlide } = simulateMove(
          current.lo,
          current.hi,
          current.state,
          walls,
          dir,
          this.orderIndices,
          this.tempPositions
        );
        if (!moved) continue;

        const newG = current.g + 1;

        const prevMinG = visited.get(newLo, newHi);
        if (prevMinG !== -1 && newG >= prevMinG) {
          continue;
        }

        visited.set(newLo, newHi, newG);

        const nextH = calculateHeuristic(newState, targets, context, options.heuristicMode);
        const f = newG + nextH;
        const childNode: SearchNode = {
          state: newState,
          lo: newLo,
          hi: newHi,
          g: newG,
          h: nextH,
          f,
          priority: calculatePriority(f, nextH),
          isPureSlide,
          parent: current,
          action: dir,
        };

        openList.push(childNode);
      }

      // Check optional timeout or node limit
      if (
        (maxNodes !== Infinity && nodesExpanded > maxNodes) ||
        (timeLimitMs !== Infinity && performance.now() - startTime > timeLimitMs)
      ) {
        break;
      }

      // Time-slicing yield to keep UI responsive
      if (nodesExpanded % batchSize === 0 || performance.now() - lastProgressReport > 60) {
        const now = performance.now();
        lastProgressReport = now;

        if (current.g > maxKnownDepth) {
          maxKnownDepth = current.g;
        }

        options.onProgress?.({
          nodesExpanded,
          openSetSize: openList.size,
          visitedCount: visited.size,
          executionTimeMs: now - startTime,
          status: 'SEARCHING',
          currentStep: maxKnownDepth,
        });

        // Yield execution to event loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const executionTimeMs = performance.now() - startTime;
    options.onProgress?.({
      nodesExpanded,
      openSetSize: openList.size,
      visitedCount: visited.size,
      executionTimeMs,
      status: 'UNSOLVABLE',
    });

    return {
      success: false,
      solutionMoves: [],
      solutionStates: [],
      totalSteps: 0,
      nodesExpanded,
      visitedCount: visited.size,
      executionTimeMs,
    };
  }

  private reconstructPath(
    goalNode: SearchNode,
    nodesExpanded: number,
    visitedCount: number,
    executionTimeMs: number
  ): SolverResult {
    const moves: Direction[] = [];
    const states: BoxState[] = [];

    let curr: SearchNode | null = goalNode;
    while (curr !== null) {
      states.unshift(curr.state);
      if (curr.action !== null) {
        moves.unshift(curr.action);
      }
      curr = curr.parent;
    }

    return {
      success: true,
      solutionMoves: moves,
      solutionStates: states,
      totalSteps: moves.length,
      nodesExpanded,
      visitedCount,
      executionTimeMs,
    };
  }
}
