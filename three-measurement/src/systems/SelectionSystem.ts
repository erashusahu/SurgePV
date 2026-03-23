import * as THREE from 'three';
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { World } from '../ecs/World';
import { Entity } from '../ecs/Entity';
import { Renderable } from '../components/Renderable';
import { Interactive } from '../components/Interactive';
import { Dimension } from '../components/Dimension';

/**
 * SelectionSystem
 * Handles visual feedback for selected/hovered entities
 */
export class SelectionSystem extends System {
  private world: World;
  private highlightMaterial: THREE.MeshStandardMaterial;
  private highlightLineMaterial: THREE.LineBasicMaterial;
  private selectedEntityId: string | null = null;

  constructor(world: World, eventBus: EventBus) {
    super('SelectionSystem', eventBus);
    this.world = world;
    this.setRequiredComponents('Interactive');
    this.setPriority(50);

    // Create highlight materials
    this.highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd600,
      emissive: 0xffd600,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.3
    });

    this.highlightLineMaterial = new THREE.LineBasicMaterial({
      color: 0xffd600,
      linewidth: 3
    });

    // Listen for selection events
    this.on('entity:select', (data) => {
      this.selectEntity(data.id as string);
    });

    this.on('entity:deselect', () => {
      this.deselectAll();
    });

    this.on('entity:toggle-select', (data) => {
      const id = data.id as string;
      if (this.selectedEntityId === id) {
        this.deselectAll();
      } else {
        this.selectEntity(id);
      }
    });
  }

  onInit(): void {
    // Initial setup if needed
  }

  update(_deltaTime: number): void {
    for (const entity of this.entities.values()) {
      const interactive = entity.getComponent<Interactive>('Interactive');
      const renderable = entity.getComponent<Renderable>('Renderable');
      const dimension = entity.getComponent<Dimension>('Dimension');

      if (!interactive) continue;

      // Handle shape selection highlighting
      if (renderable && renderable.mesh instanceof THREE.Mesh) {
        if (interactive.selected) {
          this.applyHighlight(renderable);
        } else {
          this.removeHighlight(renderable);
        }
      }

      // Handle measurement dimension highlighting
      if (dimension) {
        dimension.setHighlighted(interactive.selected);
        if (dimension.line && interactive.selected) {
          dimension.line.material = this.highlightLineMaterial;
        } else if (dimension.line && renderable?.originalMaterial) {
          // Restore original line material handled elsewhere
        }
      }
    }
  }

  /**
   * Select an entity by ID
   */
  selectEntity(entityId: string): void {
    // Deselect previous
    if (this.selectedEntityId && this.selectedEntityId !== entityId) {
      const prevEntity = this.entities.get(this.selectedEntityId);
      if (prevEntity) {
        const interactive = prevEntity.getComponent<Interactive>('Interactive');
        if (interactive) {
          interactive.setSelected(false);
        }
      }
    }

    // Select new - query from world to ensure we find the entity
    const entity = this.world.getEntity(entityId);
    if (entity) {
      // Also add to our entities map if not present
      if (!this.entities.has(entityId)) {
        this.entities.set(entityId, entity);
      }
      const interactive = entity.getComponent<Interactive>('Interactive');
      if (interactive && interactive.canSelect()) {
        interactive.setSelected(true);
        this.selectedEntityId = entityId;
        this.emit('selection:changed', { entityId, selected: true });
      }
    }
  }

  /**
   * Deselect all entities
   */
  deselectAll(): void {
    for (const entity of this.entities.values()) {
      const interactive = entity.getComponent<Interactive>('Interactive');
      if (interactive) {
        interactive.setSelected(false);
      }
    }
    this.selectedEntityId = null;
    this.emit('selection:changed', { entityId: null, selected: false });
  }

  /**
   * Get currently selected entity
   */
  getSelectedEntity(): Entity | null {
    if (!this.selectedEntityId) return null;
    return this.entities.get(this.selectedEntityId) ?? null;
  }

  /**
   * Get selected entity ID
   */
  getSelectedEntityId(): string | null {
    return this.selectedEntityId;
  }

  /**
   * Check if any entity is selected
   */
  hasSelection(): boolean {
    return this.selectedEntityId !== null;
  }

  /**
   * Apply highlight to renderable
   */
  private applyHighlight(renderable: Renderable): void {
    if (renderable.mesh instanceof THREE.Mesh) {
      if (!renderable.mesh.userData.highlighted) {
        renderable.mesh.material = this.highlightMaterial;
        renderable.mesh.userData.highlighted = true;
      }
    }
  }

  /**
   * Remove highlight from renderable
   */
  private removeHighlight(renderable: Renderable): void {
    if (renderable.mesh instanceof THREE.Mesh && renderable.mesh.userData.highlighted) {
      renderable.restoreMaterial();
      renderable.mesh.userData.highlighted = false;
    }
  }

  onDestroy(): void {
    this.highlightMaterial.dispose();
    this.highlightLineMaterial.dispose();
  }
}
