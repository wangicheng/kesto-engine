import { LevelData } from '../engine/types';

export const BENCHMARK_TEST_LEVELS: LevelData[] = [
  {
    id: 'bench-1',
    name: '1. Test Level 1 (4 Boxes, 0 Walls)',
    description: '4 boxes 4 targets 0 walls',
    walls: [],
    boxes: [17, 18, 25, 26],
    targets: [37, 45, 46, 38],
  },
  {
    id: 'bench-2',
    name: '2. Test Level 2 (4 Boxes, 8 Walls)',
    description: '4 boxes 4 targets 8 walls',
    walls: [19, 20, 29, 37, 44, 43, 26, 34],
    boxes: [9, 10, 17, 18],
    targets: [45, 46, 53, 54],
  },
  {
    id: 'bench-3',
    name: '3. Test Level 3 (6 Boxes, 4 Walls)',
    description: '6 boxes 6 targets 4 walls',
    walls: [19, 20, 44, 43],
    boxes: [9, 10, 17, 18, 25, 26],
    targets: [45, 46, 53, 54, 37, 38],
  },
  {
    id: 'bench-4',
    name: '4. Test Level 4 (6 Boxes, 8 Walls)',
    description: '6 boxes 6 targets 8 walls',
    walls: [16, 18, 42, 40, 21, 23, 47, 45],
    boxes: [17, 24, 26, 32, 34, 41],
    targets: [22, 29, 37, 31, 39, 46],
  },
  {
    id: 'bench-5',
    name: '5. Test Level 5 (8 Boxes, 4 Walls)',
    description: '8 boxes 8 targets 4 walls',
    walls: [27, 35, 36, 28],
    boxes: [1, 2, 8, 11, 16, 19, 25, 26],
    targets: [47, 55, 62, 61, 45, 53, 63, 46],
  },
  {
    id: 'bench-6',
    name: '6. Test Level 6 (8 Boxes, 4 Walls Line)',
    description: '8 boxes 8 targets 4 walls line',
    walls: [27, 35, 36, 28],
    boxes: [0, 1, 2, 3, 4, 5, 6, 7],
    targets: [56, 57, 58, 59, 60, 61, 62, 63],
  },
  {
    id: 'bench-7',
    name: '7. Test Level 7 (4 Boxes, 5 Walls)',
    description: '4 boxes 4 targets 5 walls',
    walls: [20, 21, 13, 29, 22],
    boxes: [27, 28, 35, 36],
    targets: [41, 34, 50, 43],
  },
  {
    id: 'bench-8',
    name: '8. Test Level 8 (2 Boxes, 2 Walls)',
    description: '2 boxes 2 targets 2 walls',
    walls: [45, 18],
    boxes: [27, 36],
    targets: [9, 54],
  },
  {
    id: 'bench-9',
    name: '9. Test Level 9 (8 Boxes, 2 Walls)',
    description: '8 boxes 8 targets 2 walls',
    walls: [28, 35],
    boxes: [2, 9, 10, 11, 16, 17, 18, 25],
    targets: [38, 47, 46, 45, 54, 53, 52, 61],
  },
];

export const STRESS_TEST_LEVEL_K16 = {
  walls: [18, 21, 45, 42],
  boxes: [0, 1, 6, 7, 8, 9, 14, 15, 48, 49, 54, 55, 56, 57, 62, 63],
  targets: [19, 27, 35, 43, 44, 36, 28, 20, 25, 33, 34, 26, 29, 37, 38, 30],
};
