import { KestoSolver } from './engine/solver';
import { arrayToBitboard } from './engine/bitboard';

declare const process: any;

const level16 = {
  walls: [18, 21, 45, 42],
  boxes: [0, 1, 6, 7, 8, 9, 14, 15, 48, 49, 54, 55, 56, 57, 62, 63],
  targets: [19, 27, 35, 43, 44, 36, 28, 20, 25, 33, 34, 26, 29, 37, 38, 30],
};

const solver = new KestoSolver();
const wallsBitboard = arrayToBitboard(level16.walls);

console.log('================================================================');
console.log('            KESTO ENGINE 16-BOX (k=16) TEST SUITE               ');
console.log('================================================================\n');

const memBefore = process.memoryUsage();
const startTime = performance.now();

const result = solver.solve(level16.boxes, wallsBitboard, level16.targets, {
  timeLimitMs: 60000,
  maxNodes: 5000000,
});

const executionTimeMs = performance.now() - startTime;
const memAfter = process.memoryUsage();

const heapUsedDiffMb = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);
const rssDiffMb = (memAfter.rss - memBefore.rss) / (1024 * 1024);

console.log(`[Status]         : ${result.success ? '✅ SOLVED' : '❌ FAILED/TIMEOUT'}`);
console.log(`[Optimal Steps]  : ${result.totalSteps}`);
console.log(`[Nodes Expanded] : ${result.nodesExpanded.toLocaleString()}`);
console.log(`[Visited Count]  : ${result.visitedCount.toLocaleString()}`);
console.log(`[Execution Time] : ${executionTimeMs.toFixed(3)} ms`);
console.log(`[Heap Used Diff] : ${heapUsedDiffMb.toFixed(2)} MB`);
console.log(`[RSS Memory Diff]: ${rssDiffMb.toFixed(2)} MB`);
console.log(`[Total Heap Used]: ${(memAfter.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
console.log('================================================================');
