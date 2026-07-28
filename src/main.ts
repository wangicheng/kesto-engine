import './styles/main.css';
import { SAMPLE_LEVELS } from './presets';
import { arrayToBitboard } from './engine/bitboard';
import { KestoSolver } from './engine/solver';
import { BoardView } from './ui/boardView';
import { ControlsManager } from './ui/controls';
import { Direction, SolverResult, BoxState } from './engine/types';

class KestoApp {
  private boardView: BoardView;
  private controlsManager: ControlsManager;
  private solver = new KestoSolver();

  private currentInitialData = { walls: [] as number[], boxes: [] as number[], targets: [] as number[] };
  private currentSolution: SolverResult | null = null;
  private sampleLevelIndex = 0;

  constructor() {
    const gridElement = document.getElementById('boardGrid')!;

    this.boardView = new BoardView(gridElement, {
      onBoardChanged: () => {
        this.currentInitialData = this.boardView.getLevelData();
        this.currentSolution = null;
        this.controlsManager.setResetEnabled(false);
      },
      onMove: () => {
        this.controlsManager.setResetEnabled(this.hasMovedFromInitial());
      },
    });

    this.controlsManager = new ControlsManager({
      onSolveRequested: () => this.handleSolve(),
      onCancelRequested: () => this.handleCancel(),
      onRandomRequested: () => this.loadNextSampleLevel(),
      onResetRequested: () => this.handleReset(),
      onToolSelected: (tool) => this.boardView.setActiveTool(tool),
      onClearAllRequested: () => this.handleClearAll(),
      onExportJSONRequested: () => this.handleExportJSON(),
      onImportJSONRequested: (data) => this.handleImportJSON(data),
      onPlaybackStep: (stepIdx) => this.handlePlaybackStep(stepIdx),
    });

    this.init();
  }

  private init(): void {
    // Load initial sample board layout
    this.loadSampleLevel(0);

    // Setup directional controls & keyboard bindings
    this.bindKeyboardAndInput();
  }

  private hasMovedFromInitial(): boolean {
    const currentBoxes = this.boardView.getBoxes().sort((a, b) => a - b);
    const initialBoxes = [...this.currentInitialData.boxes].sort((a, b) => a - b);
    if (currentBoxes.length !== initialBoxes.length) return true;
    return currentBoxes.some((val, i) => val !== initialBoxes[i]);
  }

  private loadSampleLevel(index: number): void {
    this.sampleLevelIndex = index;
    const level = SAMPLE_LEVELS[index % SAMPLE_LEVELS.length];
    this.currentInitialData = {
      walls: [...level.walls],
      boxes: [...level.boxes],
      targets: [...level.targets],
    };

    this.boardView.setLevelData(
      this.currentInitialData.walls,
      this.currentInitialData.boxes,
      this.currentInitialData.targets
    );

    this.currentSolution = null;
    this.controlsManager.setResetEnabled(false);
    this.resetStats();
  }

  private loadNextSampleLevel(): void {
    this.loadSampleLevel(this.sampleLevelIndex + 1);
  }

  private handleReset(): void {
    this.boardView.setBoxes(this.currentInitialData.boxes, true);
    this.currentSolution = null;
    this.controlsManager.setResetEnabled(false);
    this.resetStats();
  }

  private resetStats(): void {
    this.controlsManager.updateSearchProgress({
      nodesExpanded: 0,
      openSetSize: 0,
      visitedCount: 0,
      executionTimeMs: 0,
      status: 'IDLE',
    });
  }

  private async handleSolve(): Promise<void> {
    const levelData = this.boardView.getLevelData();
    if (levelData.boxes.length === 0) {
      alert('Please place at least one box on the board first.');
      return;
    }
    if (levelData.targets.length === 0) {
      alert('Please place at least one target on the board first.');
      return;
    }

    const wallBitboard = arrayToBitboard(levelData.walls);

    this.controlsManager.updateSearchProgress({
      nodesExpanded: 0,
      openSetSize: 0,
      visitedCount: 0,
      executionTimeMs: 0,
      status: 'SEARCHING',
    });

    const result = await this.solver.solveAsync(
      levelData.boxes,
      wallBitboard,
      levelData.targets,
      {
        onProgress: (prog) => this.controlsManager.updateSearchProgress(prog),
      }
    );

    this.currentSolution = result;
    this.controlsManager.displaySolverResult(result);
  }

  private handleCancel(): void {
    this.solver.cancel();
  }

  private handleClearAll(): void {
    this.boardView.setLevelData([], [], []);
    this.currentInitialData = { walls: [], boxes: [], targets: [] };
    this.currentSolution = null;
    this.controlsManager.setResetEnabled(false);
    this.resetStats();
  }

  private handleExportJSON(): void {
    const data = this.boardView.getLevelData();
    const jsonStr = JSON.stringify(data, null, 2);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kesto_board.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private handleImportJSON(data: any): void {
    if (Array.isArray(data.walls) && Array.isArray(data.boxes) && Array.isArray(data.targets)) {
      this.currentInitialData = {
        walls: [...data.walls],
        boxes: [...data.boxes],
        targets: [...data.targets],
      };
      this.boardView.setLevelData(data.walls, data.boxes, data.targets);
      this.currentSolution = null;
      this.controlsManager.setResetEnabled(false);
      this.resetStats();
    } else {
      alert('Invalid board data format! Must include walls, boxes, and targets arrays.');
    }
  }

  private handlePlaybackStep(stepIndex: number): void {
    if (
      this.currentSolution &&
      this.currentSolution.success &&
      this.currentSolution.solutionStates[stepIndex]
    ) {
      const state: BoxState = this.currentSolution.solutionStates[stepIndex];
      this.boardView.setBoxes(state, true);
      this.controlsManager.setResetEnabled(this.hasMovedFromInitial());
    }
  }

  private bindKeyboardAndInput(): void {
    const handleMove = (dir: Direction) => {
      this.boardView.executeMove(dir);
    };

    // D-Pad Buttons
    document.getElementById('btnUp')?.addEventListener('click', () => handleMove('UP'));
    document.getElementById('btnDown')?.addEventListener('click', () => handleMove('DOWN'));
    document.getElementById('btnLeft')?.addEventListener('click', () => handleMove('LEFT'));
    document.getElementById('btnRight')?.addEventListener('click', () => handleMove('RIGHT'));

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Hotkey Brush Tool Switch (1, 2, 3, 4)
      switch (e.key) {
        case '1':
          this.boardView.setActiveTool('WALL');
          this.controlsManager.setToolActive('WALL');
          return;
        case '2':
          this.boardView.setActiveTool('BOX');
          this.controlsManager.setToolActive('BOX');
          return;
        case '3':
          this.boardView.setActiveTool('TARGET');
          this.controlsManager.setToolActive('TARGET');
          return;
        case '4':
          this.boardView.setActiveTool('ERASE');
          this.controlsManager.setToolActive('ERASE');
          return;
      }

      // Directional Movement Hotkeys (WASD / Arrows)
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          handleMove('UP');
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          handleMove('DOWN');
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          handleMove('LEFT');
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          handleMove('RIGHT');
          e.preventDefault();
          break;
      }
    });
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  new KestoApp();
});
