import * as THREE from 'three';
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { Snappable } from '../components/Snappable';
import { Renderable } from '../components/Renderable';
import type { SnapResult } from '../components/Snappable';

/**
 * SnappingSystem
 * Manages vertex snapping for precise measurements
 */
export class SnappingSystem extends System {
  private scene: THREE.Scene;
  private snapIndicator: THREE.Mesh | null = null;
  private snapRadius = 0.6;
  private enabled = true;

  // Shared materials/geometry
  private snapMaterial: THREE.MeshBasicMaterial;
  private snapGeometry: THREE.SphereGeometry;

  constructor(scene: THREE.Scene, eventBus: EventBus) {
    super('SnappingSystem', eventBus);
    this.scene = scene;
    this.setRequiredComponents('Snappable', 'Renderable');
    this.setPriority(10);

    // Create snap indicator visuals
    this.snapGeometry = new THREE.SphereGeometry(0.18, 12, 12);
    this.snapMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9
    });

    // Listen for snap requests
    this.on('snap:find', (data) => {
      const point = data.point as THREE.Vector3;
      const result = this.findSnapTarget(point);
      this.emit('snap:result', { result, point });
    });

    this.on('snap:invalidate', () => {
      this.invalidateAllCaches();
    });
  }

  onInit(): void {
    this.createSnapIndicator();
  }

  update(_deltaTime: number): void {
    // Update world vertices for entities that need it
    for (const entity of this.entities.values()) {
      const snappable = entity.getComponent<Snappable>('Snappable');
      const renderable = entity.getComponent<Renderable>('Renderable');

      if (snappable && renderable && !snappable.isCacheValid()) {
        if (renderable.mesh instanceof THREE.Mesh) {
          snappable.updateWorldVertices(renderable.mesh);
        }
      }
    }
  }

  /**
   * Create the snap indicator mesh
   */
  private createSnapIndicator(): void {
    this.snapIndicator = new THREE.Mesh(this.snapGeometry, this.snapMaterial);
    this.snapIndicator.name = 'snap-indicator';
    this.snapIndicator.visible = false;
    this.scene.add(this.snapIndicator);
  }

  /**
   * Find nearest snap target across all snappable entities
   */
  findSnapTarget(point: THREE.Vector3): SnapResult | null {
    if (!this.enabled) return null;

    let bestResult: SnapResult | null = null;
    let bestDistance = this.snapRadius;

    for (const entity of this.entities.values()) {
      const snappable = entity.getComponent<Snappable>('Snappable');

      if (snappable && snappable.enabled) {
        const result = snappable.findNearestVertex(point, bestDistance);
        if (result && result.distance < bestDistance) {
          bestResult = result;
          bestDistance = result.distance;
        }
      }
    }

    return bestResult;
  }

  /**
   * Show snap indicator at position
   */
  showSnapIndicator(position: THREE.Vector3): void {
    if (this.snapIndicator) {
      this.snapIndicator.position.copy(position);
      this.snapIndicator.visible = true;
    }
  }

  /**
   * Hide snap indicator
   */
  hideSnapIndicator(): void {
    if (this.snapIndicator) {
      this.snapIndicator.visible = false;
    }
  }

  /**
   * Invalidate all snap caches (call after transforms change)
   */
  invalidateAllCaches(): void {
    for (const entity of this.entities.values()) {
      const snappable = entity.getComponent<Snappable>('Snappable');
      if (snappable) {
        snappable.invalidateCache();
      }
    }
  }

  /**
   * Invalidate cache for specific entity
   */
  invalidateEntityCache(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      const snappable = entity.getComponent<Snappable>('Snappable');
      if (snappable) {
        snappable.invalidateCache();
      }
    }
  }

  /**
   * Set snap radius
   */
  setSnapRadius(radius: number): void {
    this.snapRadius = radius;
  }

  /**
   * Enable/disable snapping
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if snapping is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  onDestroy(): void {
    if (this.snapIndicator) {
      this.scene.remove(this.snapIndicator);
      this.snapIndicator = null;
    }
    this.snapGeometry.dispose();
    this.snapMaterial.dispose();
  }
}
