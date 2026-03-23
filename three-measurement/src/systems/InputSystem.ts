import * as THREE from 'three';
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { World } from '../ecs/World';
import { Renderable } from '../components/Renderable';
import { Interactive } from '../components/Interactive';
import { Shape } from '../components/Shape';

/**
 * App interaction modes
 */
export type AppMode = 'idle' | 'measuring' | 'removing' | 'moving';

/**
 * InputSystem
 * Handles mouse/keyboard input and emits events to other systems
 */
export class InputSystem extends System {
  private world: World;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private groundPlane: THREE.Mesh;

  // State
  private currentMode: AppMode = 'idle';
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Cursor styles
  private static CURSOR_BY_MODE: Record<AppMode, string> = {
    idle: 'default',
    measuring: 'crosshair',
    removing: 'not-allowed',
    moving: 'grab'
  };

  constructor(
    world: World,
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    groundPlane: THREE.Mesh,
    eventBus: EventBus
  ) {
    super('InputSystem', eventBus);
    this.world = world;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.groundPlane = groundPlane;
    this.setPriority(5);

    this.setupEventListeners();
    this.setupModeListeners();
  }

  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse click
    canvas.addEventListener('click', (e) => this.handleClick(e));

    // Mouse move (throttled)
    let lastMoveTime = 0;
    canvas.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - lastMoveTime >= 16) { // ~60fps
        lastMoveTime = now;
        this.handleMouseMove(e);
      }
    });

    // Keyboard
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  private setupModeListeners(): void {
    this.on('mode:set', (data) => {
      this.setMode(data.mode as AppMode);
    });

    this.on('mode:toggle', (data) => {
      const targetMode = data.mode as AppMode;
      if (this.currentMode === targetMode) {
        this.setMode('idle');
      } else {
        this.setMode(targetMode);
      }
    });
  }

  update(_deltaTime: number): void {
    // Input system is event-driven, nothing to update per frame
  }

  /**
   * Set raycaster from mouse event
   */
  private setRaycasterFromEvent(event: MouseEvent): void {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  /**
   * Get world position from mouse event
   */
  private getWorldPosition(event: MouseEvent): THREE.Vector3 | null {
    this.setRaycasterFromEvent(event);

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    if (intersects.length === 0) return null;

    // Find closest solid object (not measurement or ground)
    for (const hit of intersects) {
      if (this.isMeasurementObject(hit.object)) continue;
      if (hit.object === this.groundPlane) continue;
      return hit.point;
    }

    // Fallback to ground plane
    const groundHit = intersects.find(h => h.object === this.groundPlane);
    if (groundHit) return groundHit.point;

    return intersects[0].point;
  }

  /**
   * Check if object is a measurement visual
   */
  private isMeasurementObject(obj: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (current.name === 'measurement' || current.name === 'snap-indicator') {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Handle mouse click
   */
  private handleClick(event: MouseEvent): void {
    if (event.button !== 0) return; // Left click only

    const point = this.getWorldPosition(event);

    switch (this.currentMode) {
      case 'moving':
        // DragControls handles this
        return;

      case 'removing':
        this.handleRemoveClick(event);
        return;

      case 'measuring':
        if (point) {
          // Find snap point
          this.emit('snap:find', { point });
          // The snap result will trigger measure:click via SnappingSystem
          // For now, emit directly
          this.emit('measure:click', { point, snappedPoint: null });
        }
        return;

      default: // idle
        this.handleIdleClick(event);
    }
  }

  /**
   * Handle click in idle mode (selection)
   */
  private handleIdleClick(event: MouseEvent): void {
    this.setRaycasterFromEvent(event);

    // Check for measurement selection
    const measurementEntities = this.world.getEntitiesWithTag('measurement');
    for (const entity of measurementEntities) {
      const renderable = entity.getComponent<Renderable>('Renderable');
      if (renderable) {
        const intersects = this.raycaster.intersectObject(renderable.mesh, true);
        if (intersects.length > 0) {
          this.emit('entity:select', { id: entity.id });
          return;
        }
      }
    }

    // Check for shape selection
    const shapeEntities = this.world.getEntitiesWith('Shape', 'Renderable');
    for (const entity of shapeEntities) {
      const renderable = entity.getComponent<Renderable>('Renderable');
      const interactive = entity.getComponent<Interactive>('Interactive');
      if (renderable && interactive?.canSelect()) {
        const intersects = this.raycaster.intersectObject(renderable.mesh, true);
        if (intersects.length > 0) {
          this.emit('entity:select', { id: entity.id });
          return;
        }
      }
    }

    // Clicked nothing - deselect
    this.emit('entity:deselect', {});
  }

  /**
   * Handle click in remove mode
   */
  private handleRemoveClick(event: MouseEvent): void {
    this.setRaycasterFromEvent(event);

    const shapeEntities = this.world.getEntitiesWith('Shape', 'Renderable');
    for (const entity of shapeEntities) {
      const shape = entity.getComponent<Shape>('Shape');
      const renderable = entity.getComponent<Renderable>('Renderable');

      if (shape?.canRemove() && renderable) {
        const intersects = this.raycaster.intersectObject(renderable.mesh, true);
        if (intersects.length > 0) {
          this.emit('shape:remove', { id: entity.id });
          return;
        }
      }
    }
  }

  /**
   * Handle mouse move
   */
  private handleMouseMove(event: MouseEvent): void {
    if (this.currentMode !== 'measuring') return;

    const point = this.getWorldPosition(event);
    if (point) {
      this.emit('measure:move', { point, snappedPoint: null });
    }
  }

  /**
   * Handle keyboard input
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    // Undo (Ctrl+Z)
    if (key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.emit('shape:undo', {});
      return;
    }

    // Escape - cancel/deselect
    if (key === 'escape') {
      if (this.currentMode === 'measuring') {
        this.emit('measure:cancel', {});
      } else {
        this.emit('entity:deselect', {});
      }
      return;
    }

    // Only in idle mode with selection
    if (this.currentMode === 'idle') {
      if (key === 'e') {
        this.emit('selection:delete', {});
      } else if (key === 'm') {
        this.emit('selection:cycle-unit', {});
      } else if (key === 'c') {
        this.emit('measure:cycle-unit', {});
      }
    }
  }

  /**
   * Set interaction mode
   */
  setMode(mode: AppMode): void {
    const previousMode = this.currentMode;

    // Exit previous mode
    if (previousMode === 'measuring') {
      this.emit('measure:deactivate', {});
    }

    this.currentMode = mode;
    this.renderer.domElement.style.cursor = InputSystem.CURSOR_BY_MODE[mode];

    // Enter new mode
    if (mode === 'measuring') {
      this.emit('measure:activate', {});
    }

    this.emit('mode:changed', { mode, previousMode });
  }

  /**
   * Get current mode
   */
  getMode(): AppMode {
    return this.currentMode;
  }
}
