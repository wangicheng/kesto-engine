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
  private boxElementsMap = new Map<number, HTMLElement>();

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
    this.boxes = [...newBoxes].sort((a, b) => a - b);
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
      this.boxes = result.newState;
      this.renderBoxes(true);
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

  private renderBoxes(_animated: boolean): void {
    // Remove obsolete box DOM elements
    const boxSet = new Set(this.boxes);
    for (const [idx, el] of this.boxElementsMap.entries()) {
      if (!boxSet.has(idx)) {
        el.remove();
        this.boxElementsMap.delete(idx);
      }
    }

    // Create or update box DOM elements
    for (let i = 0; i < this.boxes.length; i++) {
      const boxIdx = this.boxes[i];
      const cell = this.cellElements[boxIdx];

      let boxEl = this.boxElementsMap.get(boxIdx);
      if (!boxEl) {
        boxEl = document.createElement('div');
        boxEl.className = 'box-element';
        boxEl.textContent = ''; // Blank boxes with no numbers written
        this.boxElementsMap.set(boxIdx, boxEl);
      }

      if (this.targets.has(boxIdx)) {
        boxEl.classList.add('on-target');
      } else {
        boxEl.classList.remove('on-target');
      }

      if (boxEl.parentElement !== cell) {
        cell.appendChild(boxEl);
      }
    }
  }
}
