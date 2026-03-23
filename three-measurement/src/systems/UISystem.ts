import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { World } from '../ecs/World';
import { MeasuringSystem } from './MeasuringSystem';
import { ShapeSystem } from './ShapeSystem';
import { SelectionSystem } from './SelectionSystem';
import type { AppMode } from './InputSystem';

/**
 * UISystem
 * Synchronizes ECS state with DOM UI elements
 */
export class UISystem extends System {
  private world: World;

  // UI Elements
  private statusEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private instructionEl: HTMLElement | null = null;
  private unitEl: HTMLElement | null = null;
  private unitLabelEl: HTMLElement | null = null;
  private selectionInfoEl: HTMLElement | null = null;
  private undoShapeBtn: HTMLButtonElement | null = null;
  private recordsBody: HTMLElement | null = null;
  private recordsCountEl: HTMLElement | null = null;
  private recordsEmptyEl: HTMLElement | null = null;
  private measureBtn: HTMLElement | null = null;
  private removeShapeBtn: HTMLElement | null = null;
  private moveShapeBtn: HTMLElement | null = null;

  // Current state
  private currentMode: AppMode = 'idle';

  constructor(world: World, eventBus: EventBus) {
    super('UISystem', eventBus);
    this.world = world;
    this.setPriority(100); // Run last

    this.initUIElements();
    this.setupEventListeners();
  }

  private initUIElements(): void {
    this.statusEl = document.getElementById('status');
    this.countEl = document.getElementById('count');
    this.instructionEl = document.getElementById('instruction');
    this.unitEl = document.getElementById('unit-display');
    this.unitLabelEl = document.getElementById('unit-label');
    this.selectionInfoEl = document.getElementById('selection-info');
    this.undoShapeBtn = document.getElementById('undo-shape-btn') as HTMLButtonElement;
    this.recordsBody = document.getElementById('records-body');
    this.recordsCountEl = document.getElementById('records-count');
    this.recordsEmptyEl = document.getElementById('records-empty');
    this.measureBtn = document.getElementById('measure-btn');
    this.removeShapeBtn = document.getElementById('remove-shape-btn');
    this.moveShapeBtn = document.getElementById('move-shape-btn');
  }

  private setupEventListeners(): void {
    // Listen for state changes
    this.on('mode:changed', (data) => {
      this.currentMode = data.mode as AppMode;
      this.updateModeButtons();
      this.updateStatus();
    });

    this.on('measure:activated', () => this.updateStatus());
    this.on('measure:deactivated', () => this.updateStatus());
    this.on('measure:started', () => this.updateStatus());
    this.on('measure:completed', () => this.updateAll());
    this.on('measure:deleted', () => this.updateAll());
    this.on('measure:cleared', () => this.updateAll());
    this.on('measure:unit-changed', () => this.updateAll());

    this.on('selection:changed', () => this.updateStatus());

    this.on('shape:added', () => this.updateStatus());
    this.on('shape:removed', () => this.updateStatus());
    this.on('shape:undone', () => this.updateStatus());
  }

  update(_deltaTime: number): void {
    // UI updates are event-driven, but we can do periodic syncs here if needed
  }

  /**
   * Update all UI elements
   */
  updateAll(): void {
    this.updateStatus();
    this.updateRecordsTable();
  }

  /**
   * Update mode buttons
   */
  private updateModeButtons(): void {
    // Remove active class from all mode buttons
    this.measureBtn?.classList.remove('active');
    this.removeShapeBtn?.classList.remove('active');
    this.moveShapeBtn?.classList.remove('active');

    // Add active class to current mode button
    switch (this.currentMode) {
      case 'measuring':
        this.measureBtn?.classList.add('active');
        if (this.measureBtn) {
          this.measureBtn.textContent = '\u2716 Stop Measuring';
        }
        break;
      case 'removing':
        this.removeShapeBtn?.classList.add('active');
        break;
      case 'moving':
        this.moveShapeBtn?.classList.add('active');
        break;
      default:
        if (this.measureBtn) {
          this.measureBtn.textContent = '\u{1F4CF} Measure';
        }
    }
  }

  /**
   * Update status display
   */
  updateStatus(): void {
    const measuringSystem = this.world.getSystem<MeasuringSystem>('MeasuringSystem');
    const shapeSystem = this.world.getSystem<ShapeSystem>('ShapeSystem');
    const selectionSystem = this.world.getSystem<SelectionSystem>('SelectionSystem');

    if (!measuringSystem) return;

    // Update measurement count
    if (this.countEl) {
      this.countEl.textContent = `${measuringSystem.measurementCount}`;
    }

    // Update unit display
    if (this.unitEl) {
      this.unitEl.textContent = measuringSystem.unit.toUpperCase();
    }

    const UNIT_FULL_LABELS: Record<string, string> = {
      m: 'Meters',
      cm: 'Centimeters',
      ft: 'Feet',
      in: 'Inches'
    };

    if (this.unitLabelEl) {
      this.unitLabelEl.textContent = UNIT_FULL_LABELS[measuringSystem.unit] ?? measuringSystem.unit;
    }

    // Update undo button
    if (this.undoShapeBtn && shapeSystem) {
      this.undoShapeBtn.disabled = !shapeSystem.canUndo();
    }

    // Update selection info visibility
    const hasSelection = selectionSystem?.hasSelection() ?? false;
    if (this.selectionInfoEl) {
      this.selectionInfoEl.style.display =
        this.currentMode === 'idle' && hasSelection ? 'flex' : 'none';
    }

    // Update status badge and instruction
    this.updateStatusBadge(measuringSystem, hasSelection);
  }

  /**
   * Update status badge based on current mode
   */
  private updateStatusBadge(measuringSystem: MeasuringSystem, hasSelection: boolean): void {
    if (!this.statusEl || !this.instructionEl) return;

    switch (this.currentMode) {
      case 'removing':
        this.statusEl.textContent = 'Removing Shapes';
        this.statusEl.className = 'status-badge measuring';
        this.instructionEl.textContent = 'Click on any shape to delete it from the scene';
        break;

      case 'moving':
        this.statusEl.textContent = 'Moving Shapes';
        this.statusEl.className = 'status-badge moving';
        this.instructionEl.textContent = 'Click and drag any shape to move it';
        break;

      case 'measuring':
        if (measuringSystem.isMeasureInProgress()) {
          this.statusEl.textContent = 'Click second point';
          this.statusEl.className = 'status-badge measuring';
          this.instructionEl.textContent = 'Click to set endpoint • ESC to cancel';
        } else {
          this.statusEl.textContent = 'Ready';
          this.statusEl.className = 'status-badge active';
          this.instructionEl.textContent = 'Click on shapes or grid to start measuring';
        }
        break;

      default: // idle
        if (hasSelection) {
          this.statusEl.textContent = 'Selected';
          this.statusEl.className = 'status-badge selected';
          this.instructionEl.textContent = 'E = erase • M = change unit • ESC = deselect';
        } else {
          this.statusEl.textContent = 'Idle';
          this.statusEl.className = 'status-badge inactive';
          this.instructionEl.textContent = 'Click "Measure" to start • Click a line to select';
        }
    }
  }

  /**
   * Update measurements records table
   */
  updateRecordsTable(): void {
    const measuringSystem = this.world.getSystem<MeasuringSystem>('MeasuringSystem');
    const selectionSystem = this.world.getSystem<SelectionSystem>('SelectionSystem');

    if (!measuringSystem || !this.recordsBody) return;

    const records = measuringSystem.getMeasurementRecords();
    const selectedId = selectionSystem?.getSelectedEntityId();

    // Update count badge
    if (this.recordsCountEl) {
      this.recordsCountEl.textContent = `${records.length}`;
    }

    // Show/hide empty state
    if (this.recordsEmptyEl) {
      this.recordsEmptyEl.style.display = records.length === 0 ? 'block' : 'none';
    }

    // Clear existing rows
    this.recordsBody.innerHTML = '';

    // Build rows
    for (const rec of records) {
      const tr = document.createElement('tr');
      if (rec.id === selectedId) {
        tr.classList.add('row-selected');
      }

      // Row click selects measurement
      tr.addEventListener('click', () => {
        this.emit('entity:select', { id: rec.id });
      });

      tr.innerHTML = `
        <td data-label="#">${rec.index}</td>
        <td data-label="From"><span class="shape-tag">${rec.startShape}</span></td>
        <td data-label="To"><span class="shape-tag">${rec.endShape}</span></td>
        <td data-label="Distance"><span class="dist-value">${rec.formattedDistance}</span></td>
        <td data-label="Actions"></td>
      `;

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'row-delete-btn';
      deleteBtn.textContent = '\u2716';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.emit('measure:delete', { id: rec.id });
      });
      tr.lastElementChild!.appendChild(deleteBtn);

      this.recordsBody.appendChild(tr);
    }
  }
}
