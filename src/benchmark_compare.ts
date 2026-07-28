import { KestoSolver } from './engine/solver';
import { SAMPLE_LEVELS } from './presets';
import { arrayToBitboard } from './engine/bitboard';

const solver = new KestoSolver();

console.log('======================================================================================');
console.log('         KESTO ENGINE HEURISTIC COMPARISON BENCHMARK (k<=6 Perm vs k>=7 Hungarian)    ');
console.log('======================================================================================\n');

export interface BenchmarkResultItem {
  levelId: string;
  levelName: string;
  boxCount: number;
  perm: {
    success: boolean;
    steps: number;
    nodesExpanded: number;
    visitedCount: number;
    timeMs: number;
  };
  hungarian: {
    success: boolean;
    steps: number;
    nodesExpanded: number;
    visitedCount: number;
    timeMs: number;
  };
}

const results: BenchmarkResultItem[] = [];

for (const lvl of SAMPLE_LEVELS) {
  const wallsBitboard = arrayToBitboard(lvl.walls);
  const boxCount = lvl.boxes.length;
  const options = { timeLimitMs: 40000 };

  // Timed benchmark run for perm (k<=6 algorithm)
  const resPerm = solver.solve(lvl.boxes, wallsBitboard, lvl.targets, { ...options, heuristicMode: 'perm' });

  // Timed benchmark run for hungarian (k>=7 algorithm)
  const resHungarian = solver.solve(lvl.boxes, wallsBitboard, lvl.targets, { ...options, heuristicMode: 'hungarian' });

  results.push({
    levelId: lvl.id ?? '',
    levelName: lvl.name,
    boxCount,
    perm: {
      success: resPerm.success,
      steps: resPerm.totalSteps,
      nodesExpanded: resPerm.nodesExpanded,
      visitedCount: resPerm.visitedCount,
      timeMs: resPerm.executionTimeMs,
    },
    hungarian: {
      success: resHungarian.success,
      steps: resHungarian.totalSteps,
      nodesExpanded: resHungarian.nodesExpanded,
      visitedCount: resHungarian.visitedCount,
      timeMs: resHungarian.executionTimeMs,
    },
  });

  console.log(`[Level]: ${lvl.name} (Boxes k=${boxCount})`);
  console.log(`  ├─ Permutation (k<=6 Alg) : ${resPerm.success ? '✅ SOLVED' : '❌ TIMEOUT/FAIL'} | Steps: ${resPerm.totalSteps} | Nodes: ${resPerm.nodesExpanded.toLocaleString()} | Visited: ${resPerm.visitedCount.toLocaleString()} | Time: ${resPerm.executionTimeMs.toFixed(3)} ms`);
  console.log(`  └─ Hungarian   (k>=7 Alg) : ${resHungarian.success ? '✅ SOLVED' : '❌ TIMEOUT/FAIL'} | Steps: ${resHungarian.totalSteps} | Nodes: ${resHungarian.nodesExpanded.toLocaleString()} | Visited: ${resHungarian.visitedCount.toLocaleString()} | Time: ${resHungarian.executionTimeMs.toFixed(3)} ms`);
  console.log('--------------------------------------------------------------------------------------');
}

console.log('\n======================================================================================');
console.log('                                  SUMMARY DATA TABLE                                  ');
console.log('======================================================================================');
console.log(JSON.stringify(results, null, 2));
