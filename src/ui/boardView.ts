import { Direction, BoxState } from '../engine/types';
import { arrayToBitboard, arrayToHiLo } from '../engine/bitboard';
import { simulateMove } from '../engine/transition';

export type ToolMode = 'WALL' | 'BOX' | 'TARGET' | 'ERASE';
type DragAction = 'ADD' | 'REMOVE' | 'ERASE';

export interface BoardViewCallbacks {
  onMove?: (dir: Direction, newBoxes: BoxState) => void;
  onBoardChanged?: () => void;
}

export class BoardView {
  private gridElement: HTMLElement;
  private walls = new Set<number>();
  private boxes: number[] = [];
  private targets = new Set<number>();

  private activeTool: ToolMode = 'WALL';
  private callbacks: BoardViewCallbacks = {};

  private cellElements: HTMLElement[] = [];
  private boxElements: HTMLElement[] = [];

  private orderIndices = new Int32Array(64);
  private tempPositions = new Int32Array(64);

  // Brush drag-to-place state
  private isPointerDown = false;
  private dragAction: DragAction = 'ADD';
  private lastPaintedIndex: number | null = null;

  constructor(gridElement: HTMLElement, callbacks: BoardViewCallbacks = {}) {
    this.gridElement = gridElement;
    this.callbacks = callbacks;
    this.initGridDOM();
    this.bindGlobalPointerEvents();
  }

  private initGridDOM(): void {
    this.gridElement.innerHTML = '';
    this.cellElements = [];

    for (let i = 0; i < 64; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i.toString();

      cell.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return; // Only primary button
        this.handlePointerDown(i);
      });

      cell.addEventListener('pointerenter', () => {
        if (this.isPointerDown) {
          this.handlePointerOver(i);
        }
      });

      this.gridElement.appendChild(cell);
      this.cellElements.push(cell);
    }

    // Grid-level pointermove fallback for fast dragging / touch movement
    this.gridElement.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target) return;
      const cell = target.closest('.cell') as HTMLElement | null;
      if (cell && cell.dataset.index !== undefined) {
        const idx = parseInt(cell.dataset.index, 10);
        if (!isNaN(idx) && idx >= 0 && idx < 64) {
          this.handlePointerOver(idx);
        }
      }
    });
  }

  private bindGlobalPointerEvents(): void {
    const endDrag = () => {
      this.isPointerDown = false;
      this.lastPaintedIndex = null;
    };

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
  }

  public setLevelData(walls: number[], boxes: number[], targets: number[]): void {
    this.walls = new Set(walls);
    this.boxes = [...boxes].sort((a, b) => a - b);
    this.targets = new Set(targets);
    this.render();
  }

  public setActiveTool(tool: ToolMode): void {
    this.activeTool = tool;
  }

  public getLevelData(): { walls: number[]; boxes: number[]; targets: number[] } {
    return {
      walls: Array.from(this.walls),
      boxes: [...this.boxes].sort((a, b) => a - b),
      targets: Array.from(this.targets),
    };
  }

  public getBoxes(): number[] {
    return [...this.boxes];
  }

  public setBoxes(newBoxes: number[], animated = true): void {
    if (animated && this.boxes.length > 0 && this.boxes.length === newBoxes.length) {
      this.boxes = matchBoxes(this.boxes, newBoxes);
    } else {
      this.boxes = [...newBoxes].sort((a, b) => a - b);
    }
    this.renderBoxes(animated);
  }

  /**
   * Attempts to execute a manual 1-step move in the given direction.
   */
  public executeMove(dir: Direction): boolean {
    const wallBitboard = arrayToBitboard(Array.from(this.walls));
    const { lo, hi } = arrayToHiLo(this.boxes);
    const result = simulateMove(lo, hi, this.boxes, wallBitboard, dir, this.orderIndices, this.tempPositions);

    if (result.moved) {
      this.setBoxes(result.newState, true);
      this.callbacks.onMove?.(dir, this.boxes);
      return true;
    }
    return false;
  }

  private handlePointerDown(index: number): void {
    this.isPointerDown = true;
    this.lastPaintedIndex = index;
    this.dragAction = this.determineDragAction(index);
    this.applyToolAction(index, this.dragAction);
  }

  private handlePointerOver(index: number): void {
    if (!this.isPointerDown) return;
    if (this.lastPaintedIndex === index) return;

    this.lastPaintedIndex = index;
    this.applyToolAction(index, this.dragAction);
  }

  private determineDragAction(index: number): DragAction {
    switch (this.activeTool) {
      case 'WALL':
        return this.walls.has(index) ? 'REMOVE' : 'ADD';
      case 'BOX':
        return this.boxes.includes(index) ? 'REMOVE' : 'ADD';
      case 'TARGET':
        return this.targets.has(index) ? 'REMOVE' : 'ADD';
      case 'ERASE':
        return 'ERASE';
    }
  }

  private applyToolAction(index: number, action: DragAction): void {
    switch (this.activeTool) {
      case 'WALL':
        if (action === 'REMOVE') {
          this.walls.delete(index);
        } else if (action === 'ADD') {
          this.walls.add(index);
          this.boxes = this.boxes.filter((b) => b !== index);
          this.targets.delete(index);
        }
        break;

      case 'BOX':
        if (action === 'REMOVE') {
          this.boxes = this.boxes.filter((b) => b !== index);
        } else if (action === 'ADD') {
          this.walls.delete(index);
          if (!this.boxes.includes(index)) {
            this.boxes.push(index);
            this.boxes.sort((a, b) => a - b);
          }
        }
        break;

      case 'TARGET':
        if (action === 'REMOVE') {
          this.targets.delete(index);
        } else if (action === 'ADD') {
          this.walls.delete(index);
          this.targets.add(index);
        }
        break;

      case 'ERASE':
        this.walls.delete(index);
        this.boxes = this.boxes.filter((b) => b !== index);
        this.targets.delete(index);
        break;
    }

    this.render();
    this.callbacks.onBoardChanged?.();
  }

  public render(): void {
    // Render static cells & targets
    for (let i = 0; i < 64; i++) {
      const cell = this.cellElements[i];
      cell.className = 'cell';
      cell.innerHTML = '';

      if (this.walls.has(i)) {
        cell.classList.add('wall');
      }

      if (this.targets.has(i)) {
        const targetElement = document.createElement('div');
        targetElement.className = 'target-indicator';
        cell.appendChild(targetElement);
      }
    }

    // Render dynamic box overlays
    this.renderBoxes(false);
  }

  private renderBoxes(animated = false): void {
    // 1. Measure initial bounding rects if animating and element count matches
    const oldRects: (DOMRect | null)[] = [];
    if (animated && this.boxElements.length === this.boxes.length) {
      for (let i = 0; i < this.boxElements.length; i++) {
        oldRects.push(this.boxElements[i].getBoundingClientRect());
      }
    }

    // 2. Adjust box DOM elements count to match this.boxes.length
    while (this.boxElements.length < this.boxes.length) {
      const boxEl = document.createElement('div');
      boxEl.className = 'box-element';
      boxEl.textContent = '';
      this.boxElements.push(boxEl);
    }
    while (this.boxElements.length > this.boxes.length) {
      const el = this.boxElements.pop();
      el?.remove();
    }

    // 3. Update DOM placement and target classes
    for (let i = 0; i < this.boxes.length; i++) {
      const boxIdx = this.boxes[i];
      const cell = this.cellElements[boxIdx];
      const boxEl = this.boxElements[i];

      if (this.targets.has(boxIdx)) {
        boxEl.classList.add('on-target');
      } else {
        boxEl.classList.remove('on-target');
      }

      if (boxEl.parentElement !== cell) {
        cell.appendChild(boxEl);
      }
    }

    // 4. Perform FLIP animation if requested and positions changed
    if (animated && oldRects.length === this.boxes.length) {
      const animatedEls: { el: HTMLElement; dx: number; dy: number }[] = [];

      for (let i = 0; i < this.boxes.length; i++) {
        const el = this.boxElements[i];
        const oldRect = oldRects[i];
        if (!oldRect) continue;

        const newRect = el.getBoundingClientRect();
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;

        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.style.zIndex = '100';
          animatedEls.push({ el, dx, dy });
        }
      }

      if (animatedEls.length > 0) {
        // Force reflow
        void this.gridElement.offsetHeight;

        requestAnimationFrame(() => {
          for (const { el } of animatedEls) {
            el.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), background 0.2s ease';
            el.style.transform = '';

            const onEnd = () => {
              el.style.zIndex = '';
              el.removeEventListener('transitionend', onEnd);
            };
            el.addEventListener('transitionend', onEnd);
          }
        });
      }
    }
  }
}

function distSq(idx1: number, idx2: number): number {
  const x1 = idx1 % 8;
  const y1 = Math.floor(idx1 / 8);
  const x2 = idx2 % 8;
  const y2 = Math.floor(idx2 / 8);
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

function solveHungarian(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array<number>(n);
  for (let j = 1; j <= n; j++) {
    result[p[j] - 1] = j - 1;
  }
  return result;
}

function matchBoxes(oldBoxes: number[], newBoxes: number[]): number[] {
  const n = oldBoxes.length;
  if (n <= 1 || n !== newBoxes.length) return [...newBoxes].sort((a, b) => a - b);

  const costMatrix: number[][] = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      costMatrix[i][j] = distSq(oldBoxes[i], newBoxes[j]);
    }
  }

  const assignment = solveHungarian(costMatrix);
  const matched = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    matched[i] = newBoxes[assignment[i]];
  }
  return matched;
}
