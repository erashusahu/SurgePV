import { scene, camera, renderer, groundPlane, animate, addFigure, removeFigure, undoRemoveFigure, canUndo, sceneObjects, controls } from './scene';
import { MeasurementSystem } from './MeasurementSystem';
import { isMeasurementObject, invalidateVertexCache, throttle } from './utils';
import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
import './style.css';

import type { FigureType } from './scene';

// ─── App Mode State Machine ─────────────────────────────────────────────────
const AppMode = {
    Idle: 0,
    Measuring: 1,
    Removing: 2,
    Moving: 3,
} as const;

type AppMode = (typeof AppMode)[keyof typeof AppMode];

let currentMode: AppMode = AppMode.Idle;

const CURSOR_BY_MODE: Record<AppMode, string> = {
    [AppMode.Idle]: 'default',
    [AppMode.Measuring]: 'crosshair',
    [AppMode.Removing]: 'not-allowed',
    [AppMode.Moving]: 'grab',
};

// ─── Mount Renderer ──────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.appendChild(renderer.domElement);

// ─── Measurement System ──────────────────────────────────────────────────────
const measurementSystem = new MeasurementSystem(scene, sceneObjects);
measurementSystem.onStatusChange = () => updateStatus();

// ─── Drag Controls ─────────────────────────────────────────────────────────────
const dragControls = new DragControls(sceneObjects, camera, renderer.domElement);
dragControls.enabled = false;

dragControls.addEventListener('dragstart', () => {
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
});

dragControls.addEventListener('dragend', (event: any) => {
  controls.enabled = true;
  renderer.domElement.style.cursor = CURSOR_BY_MODE[currentMode];
  if (event.object) {
    invalidateVertexCache(event.object as THREE.Mesh);
  }
});

// ─── Mode Transitions ───────────────────────────────────────────────────────
function setMode(mode: AppMode): void {
  // Exit current mode
  if (currentMode === AppMode.Measuring) {
    measurementSystem.deactivate();
    measureBtn.classList.remove('active');
    measureBtn.textContent = '\u{1F4CF} Measure';
  } else if (currentMode === AppMode.Removing) {
    removeShapeBtn.classList.remove('active');
  } else if (currentMode === AppMode.Moving) {
    dragControls.enabled = false;
    moveShapeBtn.classList.remove('active');
  }

  // Toggle off if clicking the same mode button
  if (currentMode === mode) {
    currentMode = AppMode.Idle;
  } else {
    currentMode = mode;
  }

  // Enter new mode
  if (currentMode === AppMode.Measuring) {
    measurementSystem.activate();
    measureBtn.classList.add('active');
    measureBtn.textContent = '\u2716 Stop Measuring';
  } else if (currentMode === AppMode.Removing) {
    removeShapeBtn.classList.add('active');
  } else if (currentMode === AppMode.Moving) {
    dragControls.enabled = true;
    moveShapeBtn.classList.add('active');
  }

  renderer.domElement.style.cursor = CURSOR_BY_MODE[currentMode];
  updateStatus();
}

// ─── Raycaster ───────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function setRaycasterFromEvent(event: MouseEvent): void {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

function getWorldPosition(event: MouseEvent): THREE.Vector3 | null {
  setRaycasterFromEvent(event);

  // Raycast ALL scene objects — sorted by distance (closest first)
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length === 0) return null;

  // Find the closest solid object (shape) that isn't a measurement or ground
  for (const hit of intersects) {
    if (isMeasurementObject(hit.object)) continue;

    // Skip the ground plane — we'll use it as fallback
    if (hit.object === groundPlane) continue;

    // This is a solid 3D shape! Return the surface hit point
    return hit.point;
  }

  // Fallback: use ground plane intersection
  const groundHit = intersects.find((h: THREE.Intersection) => h.object === groundPlane);
  if (groundHit) return groundHit.point;

  return intersects[0].point;
}

// ─── Mouse Events ────────────────────────────────────────────────────────────
// Prevent right-click context menu (right-click is for camera orbit)
renderer.domElement.addEventListener('contextmenu', (e: Event) => e.preventDefault());

// Left-click = place measurement points OR select existing measurement OR remove shape
renderer.domElement.addEventListener('click', (event: MouseEvent) => {
  if (event.button !== 0) return;

  switch (currentMode) {
    case AppMode.Moving:
      return; // DragControls handles it

    case AppMode.Removing: {
      setRaycasterFromEvent(event);
      const intersects = raycaster.intersectObjects(scene.children, true);
      for (const hit of intersects) {
        if (isMeasurementObject(hit.object)) continue;
        if (hit.object === groundPlane) continue;
        const target = hit.object as THREE.Mesh;
        invalidateVertexCache(target);
        removeFigure(target);
        updateStatus();
        break;
      }
      return;
    }

    case AppMode.Measuring: {
      const point = getWorldPosition(event);
      if (point) {
        measurementSystem.handleClick(point);
        updateStatus();
      }
      return;
    }

    default: {
      // Idle → try to select a measurement line
      setRaycasterFromEvent(event);
      measurementSystem.selectMeasurementAt(raycaster);
      updateStatus();
    }
  }
});

renderer.domElement.addEventListener('mousemove', throttle((event: MouseEvent) => {
  if (currentMode !== AppMode.Measuring) return;

  const point = getWorldPosition(event);
  if (point) {
    measurementSystem.handleMouseMove(point);
  }
}, 16));

// ─── Keyboard Events ────────────────────────────────────────────────────────
window.addEventListener('keydown', (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();

  // Undo Shape Deletion
  if (key === 'z' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (canUndo()) {
      const restoredMesh = undoRemoveFigure();
      if (restoredMesh) invalidateVertexCache(restoredMesh);
      updateStatus();
    }
    return;
  }

  if (key === 'escape') {
    if (measurementSystem.measuring) {
      measurementSystem.cancelMeasurement();
    } else if (measurementSystem.hasSelection) {
      measurementSystem.deselectMeasurement();
    }
    updateStatus();
    return;
  }

  // Selection shortcuts (work when NOT in measure mode)
  if (!measurementSystem.measuring) {
    if (key === 'e' && measurementSystem.hasSelection) {
      measurementSystem.eraseSelected();
      updateStatus();
      return;
    }
    if (key === 'm' && measurementSystem.hasSelection) {
      measurementSystem.changeUnitSelected();
      updateStatus();
      return;
    }
    if (key === 'c') {
      measurementSystem.cycleGlobalUnit();
      updateStatus();
      return;
    }
  }
});

// ─── UI Controls ─────────────────────────────────────────────────────────────
const measureBtn = document.getElementById('measure-btn')!;
const clearBtn = document.getElementById('clear-btn')!;
const removeShapeBtn = document.getElementById('remove-shape-btn')!;
const moveShapeBtn = document.getElementById('move-shape-btn')!;
const statusEl = document.getElementById('status')!;
const countEl = document.getElementById('count')!;
const instructionEl = document.getElementById('instruction')!;
const unitEl = document.getElementById('unit-display')!;
const selectionInfoEl = document.getElementById('selection-info')!;
const undoShapeBtn = document.getElementById('undo-shape-btn') as HTMLButtonElement;
const recordsBody = document.getElementById('records-body')!;
const recordsCountEl = document.getElementById('records-count')!;
const recordsEmptyEl = document.getElementById('records-empty')!;

measureBtn.addEventListener('click', () => setMode(AppMode.Measuring));
removeShapeBtn.addEventListener('click', () => setMode(AppMode.Removing));
moveShapeBtn.addEventListener('click', () => setMode(AppMode.Moving));

undoShapeBtn.addEventListener('click', () => {
  if (canUndo()) {
    const restoredMesh = undoRemoveFigure();
    if (restoredMesh) invalidateVertexCache(restoredMesh);
    updateStatus();
  }
});

clearBtn.addEventListener('click', () => {
  measurementSystem.clearAll();
  updateStatus();
});

// ─── Add Figure Buttons ──────────────────────────────────────────────────────
const figureTypes: FigureType[] = ['box', 'sphere', 'cylinder', 'cone', 'torus'];
figureTypes.forEach((type) => {
  const btn = document.getElementById(`add-${type}`);
  if (btn) {
    btn.addEventListener('click', () => {
      const mesh = addFigure(type);
      invalidateVertexCache(mesh);
    });
  }
});

// ─── Records Table ───────────────────────────────────────────────────────────
function updateRecordsTable(): void {
  const records = measurementSystem.getMeasurementRecords();
  const selectedId = measurementSystem.selectedMeasurementId;

  recordsCountEl.textContent = `${records.length}`;
  recordsEmptyEl.style.display = records.length === 0 ? 'block' : 'none';

  // Clear existing rows
  recordsBody.innerHTML = '';

  for (const rec of records) {
    const tr = document.createElement('tr');
    if (rec.id === selectedId) tr.classList.add('row-selected');

    // Row click → select measurement in 3D
    tr.addEventListener('click', () => {
      measurementSystem.selectMeasurement(rec.id);
      updateStatus();
    });

    tr.innerHTML = `
      <td>${rec.index}</td>
      <td><span class="shape-tag">${rec.startShape}</span></td>
      <td><span class="shape-tag">${rec.endShape}</span></td>
      <td><span class="dist-value">${rec.formattedDistance}</span></td>
      <td></td>
    `;

    // Delete button (last cell)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'row-delete-btn';
    deleteBtn.textContent = '\u2716';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      measurementSystem.removeMeasurement(rec.id);
      updateStatus();
    });
    tr.lastElementChild!.appendChild(deleteBtn);

    recordsBody.appendChild(tr);
  }
}

// ─── Status Update ───────────────────────────────────────────────────────────
function updateStatus(): void {
  countEl.textContent = `${measurementSystem.measurementCount}`;
  unitEl.textContent = measurementSystem.unit.toUpperCase();
  updateRecordsTable();
  
  undoShapeBtn.disabled = !canUndo();

  const showSelection = currentMode === AppMode.Idle && measurementSystem.hasSelection;
  selectionInfoEl.style.display = showSelection ? 'flex' : 'none';

  switch (currentMode) {
    case AppMode.Removing:
      statusEl.textContent = 'Removing Shapes';
      statusEl.className = 'status-badge measuring';
      instructionEl.textContent = 'Click on any shape to delete it from the scene';
      break;

    case AppMode.Moving:
      statusEl.textContent = 'Moving Shapes';
      statusEl.className = 'status-badge moving';
      instructionEl.textContent = 'Click and drag any shape to move it';
      break;

    case AppMode.Measuring:
      if (measurementSystem.measuring) {
        statusEl.textContent = 'Click second point';
        statusEl.className = 'status-badge measuring';
        instructionEl.textContent = 'Click to set endpoint • ESC to cancel';
      } else {
        statusEl.textContent = 'Ready';
        statusEl.className = 'status-badge active';
        instructionEl.textContent = 'Click on shapes or grid to start measuring';
      }
      break;

    default: // Idle
      if (measurementSystem.hasSelection) {
        statusEl.textContent = 'Selected';
        statusEl.className = 'status-badge selected';
        instructionEl.textContent = 'E = erase • M = change unit • ESC = deselect';
      } else {
        statusEl.textContent = 'Idle';
        statusEl.className = 'status-badge inactive';
        instructionEl.textContent = 'Click "Measure" to start • Click a line to select';
      }
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
updateStatus();
animate();
