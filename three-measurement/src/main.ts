import { scene, camera, renderer, groundPlane, animate, addFigure, removeFigure, sceneObjects, controls } from './scene';
import { MeasurementSystem } from './MeasurementSystem';
import { isMeasurementObject, invalidateVertexCache, throttle } from './utils';
import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
import './style.css';

import type { FigureType } from './scene';

let isRemovingShape = false;
let isMovingShape = false;

// ─── Mount Renderer ──────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.appendChild(renderer.domElement);

// ─── Measurement System ──────────────────────────────────────────────────────
const measurementSystem = new MeasurementSystem(scene);
measurementSystem.onStatusChange = () => updateStatus();

// ─── Drag Controls ─────────────────────────────────────────────────────────────
const dragControls = new DragControls(sceneObjects, camera, renderer.domElement);
dragControls.enabled = false;

dragControls.addEventListener('dragstart', function () {
  controls.enabled = false; // Disable orbit controls while dragging
});

dragControls.addEventListener('dragend', function (event: any) {
  controls.enabled = true;
  if (event.object) {
    invalidateVertexCache(event.object as THREE.Mesh);
  }
});

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
  if (event.button !== 0) return; // Only left-click
  
  // If we are in "move shape" mode, DragControls handles interactions internally.
  if (isMovingShape) return; 

  if (isRemovingShape) {
    setRaycasterFromEvent(event);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      if (isMeasurementObject(hit.object)) continue;

      // Skip ground
      if (hit.object === groundPlane) continue;

      // Hit a valid shape! Remove it.
      const target = hit.object as THREE.Mesh;
      invalidateVertexCache(target);
      removeFigure(target);
      updateStatus();
      break;
    }
    return;
  }

  if (measurementSystem.active) {
    const point = getWorldPosition(event);
    if (point) {
      measurementSystem.handleClick(point);
      updateStatus();
    }
  } else {
    // Not in measure mode → try to select a measurement line
    setRaycasterFromEvent(event);
    measurementSystem.selectMeasurementAt(raycaster);
    updateStatus();
  }
});

renderer.domElement.addEventListener('mousemove', throttle((event: MouseEvent) => {
  if (!measurementSystem.active) return;

  const point = getWorldPosition(event);
  if (point) {
    measurementSystem.handleMouseMove(point);
  }
}, 16));

// ─── Keyboard Events ────────────────────────────────────────────────────────
window.addEventListener('keydown', (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();

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

measureBtn.addEventListener('click', () => {
  if (isRemovingShape) {
    isRemovingShape = false;
    removeShapeBtn.classList.remove('active');
  }
  if (isMovingShape) {
    isMovingShape = false;
    dragControls.enabled = false;
    moveShapeBtn.classList.remove('active');
  }

  if (measurementSystem.active) {
    measurementSystem.deactivate();
    measureBtn.classList.remove('active');
    measureBtn.textContent = '📏 Measure';
  } else {
    measurementSystem.activate();
    measureBtn.classList.add('active');
    measureBtn.textContent = '✖ Stop Measuring';
  }
  updateStatus();
});

removeShapeBtn.addEventListener('click', () => {
  isRemovingShape = !isRemovingShape;
  if (isRemovingShape) {
    isMovingShape = false;
    dragControls.enabled = false;
    moveShapeBtn.classList.remove('active');
    // Disable measure mode if active
    if (measurementSystem.active) {
      measurementSystem.deactivate();
      measureBtn.classList.remove('active');
      measureBtn.textContent = '📏 Measure';
    }
    removeShapeBtn.classList.add('active');
  } else {
    removeShapeBtn.classList.remove('active');
  }
  updateStatus();
});

moveShapeBtn.addEventListener('click', () => {
  isMovingShape = !isMovingShape;
  if (isMovingShape) {
    isRemovingShape = false;
    removeShapeBtn.classList.remove('active');
    if (measurementSystem.active) {
      measurementSystem.deactivate();
      measureBtn.classList.remove('active');
      measureBtn.textContent = '📏 Measure';
    }
    moveShapeBtn.classList.add('active');
    dragControls.enabled = true;
  } else {
    moveShapeBtn.classList.remove('active');
    dragControls.enabled = false;
  }
  updateStatus();
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

// ─── Status Update ───────────────────────────────────────────────────────────
function updateStatus(): void {
  const count = measurementSystem.measurementCount;
  countEl.textContent = `${count}`;
  unitEl.textContent = measurementSystem.unit.toUpperCase();

  if (measurementSystem.hasSelection && !isRemovingShape) {
    selectionInfoEl.style.display = 'flex';
  } else {
    selectionInfoEl.style.display = 'none';
  }

  if (isRemovingShape) {
    statusEl.textContent = 'Removing Shapes';
    statusEl.className = 'status-badge measuring'; // re-using measuring style for yellow alert
    instructionEl.textContent = 'Click on any shape to delete it from the scene';
  } else if (isMovingShape) {
    statusEl.textContent = 'Moving Shapes';
    statusEl.className = 'status-badge moving';
    instructionEl.textContent = 'Click and drag any shape to move it';
  } else if (!measurementSystem.active) {
    if (measurementSystem.hasSelection) {
      statusEl.textContent = 'Selected';
      statusEl.className = 'status-badge selected';
      instructionEl.textContent = 'E = erase • M = change unit • ESC = deselect';
    } else {
      statusEl.textContent = 'Inactive';
      statusEl.className = 'status-badge inactive';
      instructionEl.textContent = 'Click "Measure" to start • Click a line to select';
    }
  } else if (measurementSystem.measuring) {
    statusEl.textContent = 'Click second point';
    statusEl.className = 'status-badge measuring';
    instructionEl.textContent = 'Click to set endpoint • ESC to cancel • 🧲 Snapping active';
  } else {
    statusEl.textContent = 'Ready';
    statusEl.className = 'status-badge active';
    instructionEl.textContent = 'Click on shapes or grid • 🧲 Vertex snap auto-detects';
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
updateStatus();
animate();
