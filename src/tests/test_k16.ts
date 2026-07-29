import { KestoSolver } from '../engine/solver';
import { arrayToBitboard } from '../engine/bitboard';
import { STRESS_TEST_LEVEL_K16 } from './testLevels';

declare const process: any;

const solver = new KestoSolver();
const wallsBitboard = arrayToBitboard(STRESS_TEST_LEVEL_K16.walls);

console.log('================================================================');
console.log('            KESTO ENGINE 16-BOX (k=16) TEST SUITE               ');
console.log('================================================================\n');

const memBefore = process.memoryUsage();
const startTime = performance.now();

const result = solver.solve(STRESS_TEST_LEVEL_K16.boxes, wallsBitboard, STRESS_TEST_LEVEL_K16.targets, {
  timeLimitMs: 60000,
  maxNodes: 15000000,
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
