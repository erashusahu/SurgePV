import { Entity } from './Entity';
import { EventBus } from './EventBus';
import type { EventData, EventCallback } from './EventBus';

/**
 * Base System class - all systems inherit from this
 * Systems contain logic that operates on entities with specific components
 */
export abstract class System {
  protected eventBus: EventBus;
  protected entities: Map<string, Entity> = new Map();
  protected requiredComponents: string[] = [];
  protected name: string;
  protected active = true;
  protected priority = 0; // Lower = runs first
  private unsubscribers: Array<() => void> = [];

  constructor(name: string, eventBus: EventBus) {
    this.name = name;
    this.eventBus = eventBus;
  }

  /**
   * Set required components for this system
   * Systems will only process entities that have ALL these components
   */
  setRequiredComponents(...components: string[]): void {
    this.requiredComponents = components;
  }

  /**
   * Get required component types
   */
  getRequiredComponents(): string[] {
    return [...this.requiredComponents];
  }

  /**
   * Called when system is added to world
   */
  onInit?(): void;

  /**
   * Called every frame - implement in subclass
   * @param deltaTime Time since last frame in milliseconds
   */
  abstract update(deltaTime: number): void;

  /**
   * Called when system is removed from world
   */
  onDestroy?(): void;

  /**
   * Check if entity matches this system's requirements
   */
  matchesEntity(entity: Entity): boolean {
    return entity.isActive() && entity.hasComponents(...this.requiredComponents);
  }

  /**
   * Inject an entity (called by World when entity is created/modified)
   */
  injectEntity(entity: Entity): void {
    if (this.matchesEntity(entity)) {
      if (!this.entities.has(entity.id)) {
        this.entities.set(entity.id, entity);
        this.onEntityAdded?.(entity);
      }
    } else {
      this.removeEntity(entity.id);
    }
  }

  /**
   * Remove an entity from this system
   */
  removeEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      this.entities.delete(entityId);
      this.onEntityRemoved?.(entity);
    }
  }

  /**
   * Called when an entity is added to this system
   */
  protected onEntityAdded?(entity: Entity): void;

  /**
   * Called when an entity is removed from this system
   */
  protected onEntityRemoved?(entity: Entity): void;

  /**
   * Check if system is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Toggle system active/inactive
   */
  setActive(active: boolean): void {
    this.active = active;
  }

  /**
   * Get system name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get system priority
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Set system priority (lower = runs first)
   */
  setPriority(priority: number): void {
    this.priority = priority;
  }

  /**
   * Get all entities in this system
   */
  getEntities(): Map<string, Entity> {
    return new Map(this.entities);
  }

  /**
   * Get entity count in this system
   */
  getEntityCount(): number {
    return this.entities.size;
  }

  /**
   * Emit event through EventBus
   */
  protected emit(event: string, data: EventData = {}): void {
    this.eventBus.emit(event, data);
  }

  /**
   * Listen for events (auto-cleanup on destroy)
   */
  protected on(event: string, callback: EventCallback): () => void {
    const unsubscribe = this.eventBus.on(event, callback);
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Listen for event once
   */
  protected once(event: string, callback: EventCallback): () => void {
    const unsubscribe = this.eventBus.once(event, callback);
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Cleanup all event subscriptions
   */
  cleanup(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  /**
   * Get system info for debugging
   */
  getInfo(): Record<string, unknown> {
    return {
      name: this.name,
      active: this.active,
      priority: this.priority,
      entityCount: this.entities.size,
      requiredComponents: this.requiredComponents
    };
  }
}
