import { KestoSolver } from '../engine/solver';
import { BENCHMARK_TEST_LEVELS } from './testLevels';
import { arrayToBitboard } from '../engine/bitboard';

const solver = new KestoSolver();

console.log('================================================================================');
console.log('           KESTO ENGINE PERFORMANCE & THROUGHPUT BENCHMARK                      ');
console.log('================================================================================\n');

let totalNodes = 0;
let totalTimeMs = 0;

for (const lvl of BENCHMARK_TEST_LEVELS) {
  const wallsBitboard = arrayToBitboard(lvl.walls);

  // Warmup run
  solver.solve(lvl.boxes, wallsBitboard, lvl.targets);

  // Timed benchmark run
  const result = solver.solve(lvl.boxes, wallsBitboard, lvl.targets);

  totalNodes += result.nodesExpanded;
  totalTimeMs += result.executionTimeMs;

  const opsPerSec = result.executionTimeMs > 0
    ? (result.nodesExpanded / (result.executionTimeMs / 1000)).toFixed(0)
    : '0';

  console.log(`[Level]: ${lvl.name}`);
  console.log(`  Status         : ${result.success ? '✅ SOLVED' : '❌ UNSOLVED'}`);
  console.log(`  Optimal Moves  : ${result.totalSteps} steps (${result.solutionMoves.join(' -> ')})`);
  console.log(`  Nodes Expanded : ${result.nodesExpanded.toLocaleString()}`);
  console.log(`  Visited States : ${result.visitedCount.toLocaleString()}`);
  console.log(`  Execution Time : ${result.executionTimeMs.toFixed(3)} ms (${Number(opsPerSec).toLocaleString()} transitions/sec)`);
  console.log('--------------------------------------------------------------------------------');
}

console.log(`\n[SUMMARY TOTALS]`);
console.log(`  Total Nodes Expanded : ${totalNodes.toLocaleString()}`);
console.log(`  Total Execution Time : ${totalTimeMs.toFixed(3)} ms`);
const overallOps = totalTimeMs > 0 ? (totalNodes / (totalTimeMs / 1000)).toFixed(0) : '0';
console.log(`  Average Throughput   : ${Number(overallOps).toLocaleString()} transitions/sec\n`);
console.log('================================================================================');
