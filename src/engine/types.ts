export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Position {
  x: number;
  y: number;
}

// Cell index 0..63 where index = y * 8 + x
export type CellIndex = number;

// Bitboard representing static walls/obstacles (64 bits)
export interface WallBitboard {
  lo: number;
  hi: number;
}

// Dynamic state: sorted array of box cell indices [c_1, c_2, ..., c_k]
export type BoxState = number[];

// Goal targets set
export type TargetSet = number[];

export interface LevelData {
  id?: string;
  name: string;
  description?: string;
  walls: number[]; // Cell indices with walls
  boxes: number[]; // Cell indices with boxes
  targets: number[]; // Cell indices with target goals
}

export interface TransitionResult {
  newState: BoxState;
  newLo: number;
  newHi: number;
  moved: boolean;
  isPureSlide: boolean;
}

export interface SolverProgress {
  nodesExpanded: number;
  openSetSize: number;
  visitedCount: number;
  executionTimeMs: number;
  status: 'IDLE' | 'SEARCHING' | 'SOLVED' | 'UNSOLVABLE' | 'CANCELLED';
  currentStep?: number;
}

export interface SolverResult {
  success: boolean;
  solutionMoves: Direction[];
  solutionStates: BoxState[];
  totalSteps: number;
  nodesExpanded: number;
  visitedCount: number;
  executionTimeMs: number;
}
