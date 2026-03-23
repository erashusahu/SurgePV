import { Component } from './Component';

/**
 * Entity - container for components
 * Entities are just IDs with component collections
 * All behavior occurs in Systems
 */
export class Entity {
  readonly id: string;
  private components = new Map<string, Component>();
  private active = true;
  private tags = new Set<string>();

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Add a component to this entity
   */
  addComponent<T extends Component>(component: T): T {
    const type = component.type;

    if (this.components.has(type)) {
      throw new Error(`Entity ${this.id} already has component of type ${type}`);
    }

    this.components.set(type, component);

    if (component.onAttach) {
      component.onAttach();
    }

    return component;
  }

  /**
   * Remove a component from this entity
   */
  removeComponent(type: string): boolean {
    const component = this.components.get(type);

    if (!component) {
      return false;
    }

    if (component.onDetach) {
      component.onDetach();
    }

    this.components.delete(type);
    return true;
  }

  /**
   * Get a component by type
   */
  getComponent<T extends Component>(type: string): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  /**
   * Check if entity has a component
   */
  hasComponent(type: string): boolean {
    return this.components.has(type);
  }

  /**
   * Get all components as a map
   */
  getComponents(): Map<string, Component> {
    return new Map(this.components);
  }

  /**
   * Check if entity has all specified components
   */
  hasComponents(...types: string[]): boolean {
    return types.every(type => this.components.has(type));
  }

  /**
   * Get all components as array
   */
  getComponentsArray(): Component[] {
    return Array.from(this.components.values());
  }

  /**
   * Get component types this entity has
   */
  getComponentTypes(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Set entity active/inactive
   */
  setActive(active: boolean): void {
    this.active = active;
  }

  /**
   * Check if entity is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Add a tag to this entity
   */
  addTag(tag: string): void {
    this.tags.add(tag);
  }

  /**
   * Remove a tag from this entity
   */
  removeTag(tag: string): void {
    this.tags.delete(tag);
  }

  /**
   * Check if entity has a tag
   */
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  /**
   * Get all tags
   */
  getTags(): string[] {
    return Array.from(this.tags);
  }

  /**
   * Clone this entity with all its components
   */
  clone(newId?: string): Entity {
    const cloned = new Entity(newId ?? `${this.id}_clone_${Date.now()}`);

    for (const component of this.components.values()) {
      cloned.addComponent(component.clone());
    }

    for (const tag of this.tags) {
      cloned.addTag(tag);
    }

    cloned.setActive(this.active);
    return cloned;
  }

  /**
   * Get entity as JSON (for debugging/serialization)
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      active: this.active,
      tags: Array.from(this.tags),
      components: Array.from(this.components.entries()).map(([type, component]) => ({
        type,
        data: component.toJSON()
      }))
    };
  }
}
