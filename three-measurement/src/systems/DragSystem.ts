import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Interactive } from '../components/Interactive';
import { Snappable } from '../components/Snappable';

/**
 * DragSystem
 * Handles dragging shapes using Three.js DragControls
 */
export class DragSystem extends System {
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private orbitControls: OrbitControls;
  private dragControls: DragControls;
  private draggableObjects: THREE.Object3D[] = [];
  private enabled = false;
  private dragOriginalY = 0;

  constructor(
    _world: World,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    orbitControls: OrbitControls,
    eventBus: EventBus
  ) {
    super('DragSystem', eventBus);
    this.camera = camera;
    this.renderer = renderer;
    this.orbitControls = orbitControls;
    this.setRequiredComponents('Interactive', 'Renderable', 'Transform');
    this.setPriority(40);

    // Create drag controls with empty array (populated later)
    this.dragControls = new DragControls([], camera, renderer.domElement);
    this.dragControls.enabled = false;

    this.setupDragListeners();
    this.setupEventListeners();
  }

  private setupDragListeners(): void {
    this.dragControls.addEventListener('dragstart', (event: THREE.Event & { object?: THREE.Object3D }) => {
      this.orbitControls.enabled = false;
      this.renderer.domElement.style.cursor = 'grabbing';

      if (event.object) {
        this.dragOriginalY = event.object.position.y;

        // Find entity and mark as dragging
        const entity = this.findEntityByMesh(event.object);
        if (entity) {
          const interactive = entity.getComponent<Interactive>('Interactive');
          if (interactive) {
            interactive.setDragging(true);
          }
        }
      }

      this.emit('drag:start', { object: event.object });
    });

    this.dragControls.addEventListener('drag', (event: THREE.Event & { object?: THREE.Object3D }) => {
      if (event.object) {
        // Lock Y axis - shapes move only on XZ plane
        event.object.position.y = this.dragOriginalY;

        // Update entity transform
        const entity = this.findEntityByMesh(event.object);
        if (entity) {
          const transform = entity.getComponent<Transform>('Transform');
          if (transform) {
            transform.copyPosition(event.object.position);
          }
        }
      }
    });

    this.dragControls.addEventListener('dragend', (event: THREE.Event & { object?: THREE.Object3D }) => {
      this.orbitControls.enabled = true;
      this.renderer.domElement.style.cursor = this.enabled ? 'grab' : 'default';

      if (event.object) {
        // Find entity and update
        const entity = this.findEntityByMesh(event.object);
        if (entity) {
          const interactive = entity.getComponent<Interactive>('Interactive');
          if (interactive) {
            interactive.setDragging(false);
          }

          // Invalidate snap cache
          const snappable = entity.getComponent<Snappable>('Snappable');
          if (snappable) {
            snappable.invalidateCache();
          }

          this.emit('snap:invalidate', {});
        }
      }

      this.emit('drag:end', { object: event.object });
    });
  }

  private setupEventListeners(): void {
    this.on('mode:changed', (data) => {
      this.setEnabled(data.mode === 'moving');
    });

    this.on('drag:enable', () => this.setEnabled(true));
    this.on('drag:disable', () => this.setEnabled(false));
  }

  /**
   * Find entity by its mesh
   */
  private findEntityByMesh(mesh: THREE.Object3D): ReturnType<World['getEntity']> {
    for (const entity of this.entities.values()) {
      const renderable = entity.getComponent<Renderable>('Renderable');
      if (renderable && renderable.mesh === mesh) {
        return entity;
      }
    }
    return undefined;
  }

  update(_deltaTime: number): void {
    // Rebuild draggable objects list if entities changed
    this.rebuildDraggableList();
  }

  /**
   * Rebuild the list of draggable objects
   */
  private rebuildDraggableList(): void {
    const newList: THREE.Object3D[] = [];

    for (const entity of this.entities.values()) {
      const interactive = entity.getComponent<Interactive>('Interactive');
      const renderable = entity.getComponent<Renderable>('Renderable');

      if (interactive?.canDrag() && renderable) {
        newList.push(renderable.mesh);
      }
    }

    // Only update if list changed
    if (this.draggableObjects.length !== newList.length ||
        !this.draggableObjects.every((obj, i) => obj === newList[i])) {
      this.draggableObjects = newList;

      // Recreate drag controls with new objects
      const wasEnabled = this.dragControls.enabled;
      this.dragControls.dispose();
      this.dragControls = new DragControls(
        this.draggableObjects,
        this.camera,
        this.renderer.domElement
      );
      this.dragControls.enabled = wasEnabled;
      this.setupDragListeners();
    }
  }

  /**
   * Enable/disable drag controls
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.dragControls.enabled = enabled;

    if (enabled) {
      this.rebuildDraggableList();
    }
  }

  /**
   * Check if drag is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  onDestroy(): void {
    this.dragControls.dispose();
  }
}
