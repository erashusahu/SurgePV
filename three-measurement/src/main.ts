/**
 * Three.js Measurement Tool - ECS Architecture
 * Main application entry point
 */

import { scene, camera, renderer, groundPlane, controls, initializeDefaultShapes } from './scene';
import { World } from './ecs/World';
import { TransformSystem } from './systems/TransformSystem';
import { SelectionSystem } from './systems/SelectionSystem';
import { SnappingSystem } from './systems/SnappingSystem';
import { MeasuringSystem } from './systems/MeasuringSystem';
import { InputSystem } from './systems/InputSystem';
import { DragSystem } from './systems/DragSystem';
import { ShapeSystem } from './systems/ShapeSystem';
import { UISystem } from './systems/UISystem';
import { UNIT_ORDER } from './utils';
import type { ShapeType } from './components/Shape';
import './style.css';

// ─── Mount Renderer ──────────────────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
app.appendChild(renderer.domElement);

// ─── Initialize ECS World ────────────────────────────────────────────────────
const world = new World();
const eventBus = world.getEventBus();

// Enable debug mode for development (optional)
// eventBus.setDebugMode(true);

// ─── Add Systems (in priority order) ─────────────────────────────────────────
// Lower priority = runs first
world.addSystem(new TransformSystem(eventBus));                                    // Priority 0
world.addSystem(new InputSystem(world, scene, camera, renderer, groundPlane, eventBus)); // Priority 5
world.addSystem(new SnappingSystem(scene, eventBus));                              // Priority 10
world.addSystem(new ShapeSystem(world, scene, eventBus));                          // Priority 20
world.addSystem(new MeasuringSystem(world, scene, eventBus));                      // Priority 30
world.addSystem(new DragSystem(world, camera, renderer, controls, eventBus));      // Priority 40
world.addSystem(new SelectionSystem(world, eventBus));                             // Priority 50
world.addSystem(new UISystem(world, eventBus));                                    // Priority 100

// ─── Initialize Default Scene Objects ────────────────────────────────────────
initializeDefaultShapes(world);

// ─── UI Event Bindings ───────────────────────────────────────────────────────
const measureBtn = document.getElementById('measure-btn')!;
const clearBtn = document.getElementById('clear-btn')!;
const removeShapeBtn = document.getElementById('remove-shape-btn')!;
const moveShapeBtn = document.getElementById('move-shape-btn')!;
const undoShapeBtn = document.getElementById('undo-shape-btn') as HTMLButtonElement;
const addFigureDropdown = document.querySelector<HTMLDivElement>('.dropdown');
const unitBadge = document.getElementById('unit-badge') as HTMLDivElement | null;
const unitToggle = document.getElementById('unit-dropdown-toggle') as HTMLButtonElement | null;
const unitMenu = document.getElementById('unit-dropdown-menu') as HTMLDivElement | null;

// Mode toggle buttons
measureBtn.addEventListener('click', () => {
  eventBus.emit('mode:toggle', { mode: 'measuring' });
});

removeShapeBtn.addEventListener('click', () => {
  eventBus.emit('mode:toggle', { mode: 'removing' });
});

moveShapeBtn.addEventListener('click', () => {
  eventBus.emit('mode:toggle', { mode: 'moving' });
});

// Clear all measurements
clearBtn.addEventListener('click', () => {
  eventBus.emit('measure:clear-all', {});
});

// Undo shape removal
undoShapeBtn.addEventListener('click', () => {
  eventBus.emit('shape:undo', {});
});

// Add figure dropdown
if (addFigureDropdown) {
  const addFigureToggle = addFigureDropdown.querySelector<HTMLButtonElement>('.btn-add');
  if (addFigureToggle) {
    addFigureToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      addFigureDropdown.classList.toggle('open');
      addFigureToggle.setAttribute('aria-expanded', addFigureDropdown.classList.contains('open').toString());
    });
  }

  document.addEventListener('click', (event) => {
    if (!addFigureDropdown.contains(event.target as Node)) {
      addFigureDropdown.classList.remove('open');
      addFigureToggle?.setAttribute('aria-expanded', 'false');
    }
  });
}

// Add shape buttons
const figureTypes: ShapeType[] = ['box', 'sphere', 'cylinder', 'cone', 'torus'];
figureTypes.forEach((type) => {
  const btn = document.getElementById(`add-${type}`);
  if (btn) {
    btn.addEventListener('click', () => {
      eventBus.emit('shape:add', { type });
      addFigureDropdown?.classList.remove('open');
    });
  }
});

// Unit dropdown
if (unitBadge && unitToggle && unitMenu) {
  const UNIT_LABEL_MAP: Record<string, string> = {
    m: 'meters',
    cm: 'centimeters',
    ft: 'feet',
    in: 'inches',
  };

  const measuringSystem = world.getSystem<MeasuringSystem>('MeasuringSystem');

  const renderUnitMenu = (): void => {
    unitMenu.innerHTML = '';
    UNIT_ORDER.forEach((unit) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'unit-option';
      option.innerHTML = `<span>${unit.toUpperCase()}</span><small>${UNIT_LABEL_MAP[unit]}</small>`;
      if (measuringSystem && unit === measuringSystem.unit) {
        option.classList.add('active');
      }
      option.addEventListener('click', () => {
        eventBus.emit('measure:set-unit', { unit });
        unitBadge.classList.remove('open');
      });
      unitMenu.appendChild(option);
    });
  };

  unitToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    unitBadge.classList.toggle('open');
    const isOpen = unitBadge.classList.contains('open');
    unitToggle.setAttribute('aria-expanded', isOpen.toString());
    if (isOpen) {
      renderUnitMenu();
    }
  });

  document.addEventListener('click', (event) => {
    if (!unitBadge.contains(event.target as Node)) {
      unitBadge.classList.remove('open');
      unitToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// ─── Animation Loop ──────────────────────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);

  // Update ECS World (runs all systems)
  world.update();

  // Update orbit controls
  controls.update();

  // Render scene
  renderer.render(scene, camera);
}

// ─── Initial UI Update ───────────────────────────────────────────────────────
const uiSystem = world.getSystem<UISystem>('UISystem');
if (uiSystem) {
  uiSystem.updateAll();
}

// ─── Debug: Log world state (development only) ───────────────────────────────
if (import.meta.env.DEV) {
  console.log('🎮 ECS World initialized');
  world.logState();

  // Expose world for debugging in console
  (window as unknown as { ecsWorld: World }).ecsWorld = world;
}

// ─── Start Application ───────────────────────────────────────────────────────
animate();
