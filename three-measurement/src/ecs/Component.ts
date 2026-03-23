/**
 * Base Component class - all components inherit from this
 * Components hold data without logic (pure data containers)
 */
export abstract class Component {
  readonly type: string;

  constructor(type: string) {
    this.type = type;
  }

  /**
   * Called when component is added to an entity
   */
  onAttach?(): void;

  /**
   * Called when component is removed from an entity
   */
  onDetach?(): void;

  /**
   * Clone the component (must be implemented by subclasses)
   */
  abstract clone(): Component;

  /**
   * Serialize to JSON (for debugging/persistence)
   */
  abstract toJSON(): Record<string, unknown>;
}

/**
 * Component Registry - maintains component type mappings
 * Used for serialization/deserialization and type checking
 */
export class ComponentRegistry {
  private static components = new Map<string, new (...args: any[]) => Component>();

  /**
   * Register a component type
   */
  static register<T extends Component>(type: string, ComponentClass: new (...args: any[]) => T): void {
    this.components.set(type, ComponentClass);
  }

  /**
   * Get registered component class
   */
  static get(type: string): (new (...args: any[]) => Component) | undefined {
    return this.components.get(type);
  }

  /**
   * Check if component type is registered
   */
  static has(type: string): boolean {
    return this.components.has(type);
  }

  /**
   * Get all registered component types
   */
  static getAll(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Clear registry
   */
  static clear(): void {
    this.components.clear();
  }
}
