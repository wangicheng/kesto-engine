import { Direction, SolverResult, SolverProgress } from '../engine/types';
import {
  createIcons,
  Square,
  Package,
  Target,
  Eraser,
  Sparkles,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Edit3,
  Gamepad2,
  PlayCircle,
} from 'lucide';

export interface ControlsCallbacks {
  onSolveRequested: () => void;
  onCancelRequested: () => void;
  onRandomRequested: () => void;
  onResetRequested: () => void;
  onToolSelected: (tool: 'WALL' | 'BOX' | 'TARGET' | 'ERASE') => void;
  onClearAllRequested: () => void;
  onExportJSONRequested: () => void;
  onImportJSONRequested: (jsonData: any) => void;
  onPlaybackStep: (stepIndex: number) => void;
}

export class ControlsManager {
  private callbacks: ControlsCallbacks;

  // DOM Elements
  private statusBadge: HTMLElement;
  private statSteps: HTMLElement;
  private statNodes: HTMLElement;
  private statVisited: HTMLElement;
  private statTime: HTMLElement;
  private searchLoader: HTMLElement | null;

  private solveBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private btnRandom: HTMLButtonElement;

  private playbackSection: HTMLElement;
  private btnFirstStep: HTMLButtonElement;
  private btnPrevStep: HTMLButtonElement;
  private btnPlayPause: HTMLButtonElement;
  private btnNextStep: HTMLButtonElement;
  private btnLastStep: HTMLButtonElement;
  private pathMovesContainer: HTMLElement;

  private toolWallBtn: HTMLButtonElement;
  private toolBoxBtn: HTMLButtonElement;
  private toolTargetBtn: HTMLButtonElement;
  private toolEraseBtn: HTMLButtonElement;
  private btnReset: HTMLButtonElement;
  private btnClearAll: HTMLButtonElement;
  private btnExportJSON: HTMLButtonElement;
  private btnImportJSON: HTMLButtonElement;
  private fileInputJSON: HTMLInputElement;

  // Playback state
  private isPlaying = false;
  private playbackTimer: number | null = null;
  private currentStepIndex = 0;
  private totalSteps = 0;
  private solutionMoves: Direction[] = [];

  constructor(callbacks: ControlsCallbacks) {
    this.callbacks = callbacks;

    // Bind DOM elements
    this.statusBadge = document.getElementById('statusBadge')!;
    this.statSteps = document.getElementById('statSteps')!;
    this.statNodes = document.getElementById('statNodes')!;
    this.statVisited = document.getElementById('statVisited')!;
    this.statTime = document.getElementById('statTime')!;
    this.searchLoader = document.getElementById('searchLoader');

    this.solveBtn = document.getElementById('solveBtn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
    this.btnRandom = document.getElementById('btnRandom') as HTMLButtonElement;

    this.playbackSection = document.getElementById('playbackSection')!;
    this.btnFirstStep = document.getElementById('btnFirstStep') as HTMLButtonElement;
    this.btnPrevStep = document.getElementById('btnPrevStep') as HTMLButtonElement;
    this.btnPlayPause = document.getElementById('btnPlayPause') as HTMLButtonElement;
    this.btnNextStep = document.getElementById('btnNextStep') as HTMLButtonElement;
    this.btnLastStep = document.getElementById('btnLastStep') as HTMLButtonElement;
    this.pathMovesContainer = document.getElementById('pathMovesContainer')!;

    this.toolWallBtn = document.getElementById('toolWall') as HTMLButtonElement;
    this.toolBoxBtn = document.getElementById('toolBox') as HTMLButtonElement;
    this.toolTargetBtn = document.getElementById('toolTarget') as HTMLButtonElement;
    this.toolEraseBtn = document.getElementById('toolErase') as HTMLButtonElement;
    this.btnReset = document.getElementById('btnReset') as HTMLButtonElement;
    this.btnClearAll = document.getElementById('btnClearAll') as HTMLButtonElement;

    this.btnExportJSON = document.getElementById('btnExportJSON') as HTMLButtonElement;
    this.btnImportJSON = document.getElementById('btnImportJSON') as HTMLButtonElement;
    this.fileInputJSON = document.getElementById('fileInputJSON') as HTMLInputElement;

    this.bindEvents();
    this.setResetEnabled(false);
    this.refreshIcons();
  }

  public refreshIcons(): void {
    createIcons({
      icons: {
        Square,
        Package,
        Target,
        Eraser,
        Sparkles,
        Trash2,
        ArrowUp,
        ArrowDown,
        ArrowLeft,
        ArrowRight,
        Play,
        Pause,
        RotateCcw,
        SkipBack,
        SkipForward,
        ChevronLeft,
        ChevronRight,
        Download,
        Upload,
        Edit3,
        Gamepad2,
        PlayCircle,
      },
    });
  }

  public setToolActive(tool: 'WALL' | 'BOX' | 'TARGET' | 'ERASE'): void {
    const tools = [
      { btn: this.toolWallBtn, name: 'WALL' },
      { btn: this.toolBoxBtn, name: 'BOX' },
      { btn: this.toolTargetBtn, name: 'TARGET' },
      { btn: this.toolEraseBtn, name: 'ERASE' },
    ];
    tools.forEach(({ btn, name }) => {
      if (name === tool) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  public setResetEnabled(enabled: boolean): void {
    if (this.btnReset) {
      this.btnReset.disabled = !enabled;
      if (enabled) {
        this.btnReset.classList.add('btn-primary');
      } else {
        this.btnReset.classList.remove('btn-primary');
      }
    }
  }

  private bindEvents(): void {
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => this.callbacks.onResetRequested());
    }

    this.solveBtn.addEventListener('click', () => this.callbacks.onSolveRequested());
    this.cancelBtn.addEventListener('click', () => this.callbacks.onCancelRequested());
    this.btnRandom.addEventListener('click', () => {
      this.stopPlayback();
      this.callbacks.onRandomRequested();
    });

    // Tool switching
    const tools = [
      { btn: this.toolWallBtn, name: 'WALL' as const },
      { btn: this.toolBoxBtn, name: 'BOX' as const },
      { btn: this.toolTargetBtn, name: 'TARGET' as const },
      { btn: this.toolEraseBtn, name: 'ERASE' as const },
    ];

    tools.forEach(({ btn, name }) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        tools.forEach((t) => t.btn.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onToolSelected(name);
      });
    });

    this.btnClearAll.addEventListener('click', () => this.callbacks.onClearAllRequested());
    this.btnExportJSON.addEventListener('click', () => this.callbacks.onExportJSONRequested());

    // Import JSON file picker
    this.btnImportJSON.addEventListener('click', () => this.fileInputJSON.click());
    this.fileInputJSON.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target?.result as string);
            this.callbacks.onImportJSONRequested(data);
          } catch (err) {
            alert('Invalid JSON file format.');
          }
        };
        reader.readAsText(file);
      }
    });

    // Playback events
    this.btnFirstStep.addEventListener('click', () => this.stepToFirst());
    this.btnPrevStep.addEventListener('click', () => this.stepBackward());
    this.btnNextStep.addEventListener('click', () => this.stepForward());
    this.btnLastStep.addEventListener('click', () => this.stepToLast());
    this.btnPlayPause.addEventListener('click', () => this.togglePlayback());
  }

  public updateSearchProgress(progress: SolverProgress): void {
    this.statusBadge.className = `status-badge ${progress.status.toLowerCase()}`;
    this.statusBadge.textContent = progress.status;

    this.statNodes.textContent = progress.nodesExpanded.toLocaleString();
    this.statVisited.textContent = progress.visitedCount.toLocaleString();
    this.statTime.textContent = `${Math.round(progress.executionTimeMs)} ms`;

    if (progress.status === 'SEARCHING') {
      if (this.searchLoader) this.searchLoader.style.display = 'block';
      this.solveBtn.style.display = 'none';
      this.cancelBtn.style.display = 'inline-flex';
      if (progress.currentStep !== undefined && progress.currentStep >= 0) {
        this.statSteps.textContent = `≥ ${progress.currentStep}`;
      } else {
        this.statSteps.textContent = 'Searching...';
      }
    } else if (progress.status === 'IDLE') {
      if (this.searchLoader) this.searchLoader.style.display = 'none';
      this.statSteps.textContent = '-';
      this.solveBtn.style.display = 'inline-flex';
      this.cancelBtn.style.display = 'none';
    } else {
      if (this.searchLoader) this.searchLoader.style.display = 'none';
      this.solveBtn.style.display = 'inline-flex';
      this.cancelBtn.style.display = 'none';
    }
  }

  public displaySolverResult(result: SolverResult): void {
    if (this.searchLoader) this.searchLoader.style.display = 'none';
    this.solveBtn.style.display = 'inline-flex';
    this.cancelBtn.style.display = 'none';

    if (result.success) {
      this.statusBadge.className = 'status-badge solved';
      this.statusBadge.textContent = 'SOLVED';
      this.statSteps.textContent = result.totalSteps.toString();
      this.statNodes.textContent = result.nodesExpanded.toLocaleString();
      this.statVisited.textContent = result.visitedCount.toLocaleString();
      this.statTime.textContent = `${Math.round(result.executionTimeMs)} ms`;

      // Setup playback controls
      this.solutionMoves = result.solutionMoves;
      this.totalSteps = result.totalSteps;
      this.currentStepIndex = 0;
      this.renderMoveBadges();
      this.playbackSection.style.display = 'block';

      // Auto start animation playback
      this.startPlayback();
    } else {
      this.statusBadge.className = 'status-badge unsolvable';
      this.statusBadge.textContent = 'UNSOLVABLE';
      this.statSteps.textContent = 'N/A';
      this.playbackSection.style.display = 'none';
    }
  }

  private renderMoveBadges(): void {
    this.pathMovesContainer.innerHTML = '';
    const dirIconNames: Record<Direction, string> = {
      UP: 'arrow-up',
      DOWN: 'arrow-down',
      LEFT: 'arrow-left',
      RIGHT: 'arrow-right',
    };
    const dirLabels: Record<Direction, string> = {
      UP: 'UP',
      DOWN: 'DOWN',
      LEFT: 'LEFT',
      RIGHT: 'RIGHT',
    };

    this.solutionMoves.forEach((dir, i) => {
      const tag = document.createElement('div');
      tag.className = 'move-tag';
      tag.innerHTML = `<span class="move-tag-num">#${i + 1}</span><i data-lucide="${dirIconNames[dir]}"></i><span class="move-tag-label">${dirLabels[dir]}</span>`;
      tag.addEventListener('click', () => {
        this.stopPlayback();
        this.currentStepIndex = i + 1;
        this.updateActiveBadge();
        this.callbacks.onPlaybackStep(i + 1);
      });
      this.pathMovesContainer.appendChild(tag);
    });

    this.updateActiveBadge();
    this.refreshIcons();
  }

  private updateActiveBadge(): void {
    const tags = this.pathMovesContainer.querySelectorAll('.move-tag');
    tags.forEach((tag, i) => {
      if (i === this.currentStepIndex - 1) {
        tag.classList.add('active');
        tag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        tag.classList.remove('active');
      }
    });
  }

  private togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    this.stopPlayback();
    this.isPlaying = true;
    const playPauseText = document.getElementById('playPauseText');
    if (playPauseText) playPauseText.textContent = 'Pause';
    const icon = this.btnPlayPause.querySelector('i, svg');
    if (icon) {
      icon.setAttribute('data-lucide', 'pause');
      this.refreshIcons();
    }

    const interval = 400;

    this.playbackTimer = window.setInterval(() => {
      if (this.currentStepIndex < this.totalSteps) {
        this.currentStepIndex++;
        this.updateActiveBadge();
        this.callbacks.onPlaybackStep(this.currentStepIndex);
      } else {
        this.stopPlayback();
      }
    }, interval);
  }

  private stopPlayback(): void {
    this.isPlaying = false;
    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
    const playPauseText = document.getElementById('playPauseText');
    if (playPauseText) playPauseText.textContent = 'Play';
    const icon = this.btnPlayPause.querySelector('i, svg');
    if (icon) {
      icon.setAttribute('data-lucide', 'play');
      this.refreshIcons();
    }
  }

  private stepForward(): void {
    this.stopPlayback();
    if (this.currentStepIndex < this.totalSteps) {
      this.currentStepIndex++;
      this.updateActiveBadge();
      this.callbacks.onPlaybackStep(this.currentStepIndex);
    }
  }

  private stepBackward(): void {
    this.stopPlayback();
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.updateActiveBadge();
      this.callbacks.onPlaybackStep(this.currentStepIndex);
    }
  }

  private stepToFirst(): void {
    this.stopPlayback();
    this.currentStepIndex = 0;
    this.updateActiveBadge();
    this.callbacks.onPlaybackStep(0);
  }

  private stepToLast(): void {
    this.stopPlayback();
    this.currentStepIndex = this.totalSteps;
    this.updateActiveBadge();
    this.callbacks.onPlaybackStep(this.totalSteps);
  }
}
