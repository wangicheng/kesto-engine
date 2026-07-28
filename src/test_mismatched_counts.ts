import { KestoSolver } from './engine/solver';
import { arrayToBitboard } from './engine/bitboard';

const solver = new KestoSolver();
const emptyWalls = arrayToBitboard([]);

console.log('Testing solver with various box/target combinations...');

// Test 1: More boxes than targets (3 boxes, 2 targets)
const r1 = solver.solve([10, 11, 12], emptyWalls, [10, 11]);
console.log('Test 1 (3 boxes, 2 targets):', r1.success === false ? 'PASS (success: false)' : 'FAIL');

// Test 2: Fewer boxes than targets (2 boxes, 3 targets)
const r2 = solver.solve([10, 11], emptyWalls, [10, 11, 12]);
console.log('Test 2 (2 boxes, 3 targets):', r2.success === false ? 'PASS (success: false)' : 'FAIL');

// Test 3: 0 boxes, 2 targets
const r3 = solver.solve([], emptyWalls, [10, 11]);
console.log('Test 3 (0 boxes, 2 targets):', r3.success === false ? 'PASS (success: false)' : 'FAIL');

// Test 4: 2 boxes, 0 targets
const r4 = solver.solve([10, 11], emptyWalls, []);
console.log('Test 4 (2 boxes, 0 targets):', r4.success === false ? 'PASS (success: false)' : 'FAIL');

// Test 5: Async solver with mismatched counts
async function testAsync() {
  let reportedStatus = '';
  const r5 = await solver.solveAsync([10, 11, 12], emptyWalls, [10, 11], {
    onProgress: (p) => { reportedStatus = p.status; }
  });
  console.log('Test 5 (solveAsync 3 boxes, 2 targets):', r5.success === false && reportedStatus === 'UNSOLVABLE' ? 'PASS (status: UNSOLVABLE)' : 'FAIL');
}

testAsync().then(() => console.log('All tests finished successfully.'));
