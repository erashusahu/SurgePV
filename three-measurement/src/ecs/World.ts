import { Entity } from './Entity';
import { System } from './System';
import { EventBus } from './EventBus';

/**
 * World - ECS container that manages entities and systems
 * Central hub for all ECS operations
 */
export class World {
  private entities = new Map<string, Entity>();
  private systems = new Map<string, System>();
  private systemOrder: string[] = []; // Sorted by priority
  private eventBus: EventBus;
  private deltaTime = 0;
  private lastFrameTime = 0;
  private paused = false;
  private frameCount = 0;

  constructor() {
    this.eventBus = new EventBus();
  }

  /**
   * Get the EventBus instance
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Create and add a new entity
   */
  createEntity(id: string): Entity {
    if (this.entities.has(id)) {
      throw new Error(`Entity with id "${id}" already exists`);
    }

    const entity = new Entity(id);
    this.entities.set(id, entity);

    // Inject entity into all matching systems
    for (const system of this.systems.values()) {
      system.injectEntity(entity);
    }

    this.eventBus.emit('entity:created', { id, entity });
    return entity;
  }

  /**
   * Remove an entity
   */
  removeEntity(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) {
      return false;
    }

    // Remove from all systems
    for (const system of this.systems.values()) {
      system.removeEntity(id);
    }

    this.entities.delete(id);
    this.eventBus.emit('entity:removed', { id, entity });
    return true;
  }

  /**
   * Get an entity by id
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Check if entity exists
   */
  hasEntity(id: string): boolean {
    return this.entities.has(id);
  }

  /**
   * Get all entities
   */
  getEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get entities by component type(s)
   */
  getEntitiesWith(...componentTypes: string[]): Entity[] {
    return this.getEntities().filter(entity =>
      entity.isActive() && entity.hasComponents(...componentTypes)
    );
  }

  /**
   * Get entities by tag
   */
  getEntitiesWithTag(tag: string): Entity[] {
    return this.getEntities().filter(entity =>
      entity.isActive() && entity.hasTag(tag)
    );
  }

  /**
   * Get number of entities
   */
  getEntityCount(): number {
    return this.entities.size;
  }

  /**
   * Notify systems that an entity's components changed
   */
  entityChanged(entity: Entity): void {
    for (const system of this.systems.values()) {
      system.injectEntity(entity);
    }
    this.eventBus.emit('entity:changed', { id: entity.id, entity });
  }

  /**
   * Add a system to the world
   */
  addSystem(system: System): void {
    const name = system.getName();

    if (this.systems.has(name)) {
      throw new Error(`System "${name}" already exists`);
    }

    // Inject all existing entities into the system
    for (const entity of this.entities.values()) {
      system.injectEntity(entity);
    }

    this.systems.set(name, system);

    // Rebuild sorted system order
    this.rebuildSystemOrder();

    if (system.onInit) {
      system.onInit();
    }

    this.eventBus.emit('system:added', { name });
  }

  /**
   * Remove a system
   */
  removeSystem(name: string): boolean {
    const system = this.systems.get(name);
    if (!system) {
      return false;
    }

    system.cleanup();

    if (system.onDestroy) {
      system.onDestroy();
    }

    this.systems.delete(name);
    this.rebuildSystemOrder();

    this.eventBus.emit('system:removed', { name });
    return true;
  }

  /**
   * Get a system by name
   */
  getSystem<T extends System>(name: string): T | undefined {
    return this.systems.get(name) as T | undefined;
  }

  /**
   * Check if system exists
   */
  hasSystem(name: string): boolean {
    return this.systems.has(name);
  }

  /**
   * Get all systems
   */
  getSystems(): System[] {
    return Array.from(this.systems.values());
  }

  /**
   * Get system count
   */
  getSystemCount(): number {
    return this.systems.size;
  }

  /**
   * Rebuild system execution order based on priority
   */
  private rebuildSystemOrder(): void {
    this.systemOrder = Array.from(this.systems.keys()).sort((a, b) => {
      const sysA = this.systems.get(a)!;
      const sysB = this.systems.get(b)!;
      return sysA.getPriority() - sysB.getPriority();
    });
  }

  /**
   * Update all active systems
   * Call this in your animation loop
   */
  update(): void {
    if (this.paused) {
      return;
    }

    // Calculate delta time
    const now = performance.now();
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = now;
    }
    this.deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;

    // Update all active systems in priority order
    for (const name of this.systemOrder) {
      const system = this.systems.get(name);
      if (system && system.isActive()) {
        system.update(this.deltaTime);
      }
    }

    this.eventBus.emit('world:updated', { deltaTime: this.deltaTime, frameCount: this.frameCount });
  }

  /**
   * Get delta time from last update (milliseconds)
   */
  getDeltaTime(): number {
    return this.deltaTime;
  }

  /**
   * Get current frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Pause/unpause world
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) {
      // Reset lastFrameTime to prevent huge deltaTime spike
      this.lastFrameTime = performance.now();
    }
    this.eventBus.emit('world:paused', { paused });
  }

  /**
   * Check if world is paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Reset world state (clear all entities and systems)
   */
  reset(): void {
    // Remove all systems
    const systemNames = Array.from(this.systems.keys());
    for (const name of systemNames) {
      this.removeSystem(name);
    }

    // Remove all entities
    const entityIds = Array.from(this.entities.keys());
    for (const id of entityIds) {
      this.removeEntity(id);
    }

    this.lastFrameTime = 0;
    this.deltaTime = 0;
    this.frameCount = 0;
    this.eventBus.emit('world:reset', {});
  }

  /**
   * Get world statistics (for debugging)
   */
  getStats(): {
    entityCount: number;
    systemCount: number;
    paused: boolean;
    deltaTime: number;
    frameCount: number;
  } {
    return {
      entityCount: this.entities.size,
      systemCount: this.systems.size,
      paused: this.paused,
      deltaTime: this.deltaTime,
      frameCount: this.frameCount
    };
  }

  /**
   * Debug: log world state to console
   */
  logState(): void {
    console.group('🌍 ECS World State');
    console.log('Stats:', this.getStats());

    console.group('📦 Entities');
    for (const entity of this.entities.values()) {
      console.log(`  ${entity.id}:`, entity.getComponentTypes().join(', '));
    }
    console.groupEnd();

    console.group('⚙️ Systems (by priority)');
    for (const name of this.systemOrder) {
      const system = this.systems.get(name)!;
      console.log(`  [${system.getPriority()}] ${name}: ${system.getEntityCount()} entities, active: ${system.isActive()}`);
    }
    console.groupEnd();

    console.groupEnd();
  }
}
