import { Component } from '../ecs/Component';

/**
 * Shape types
 */
export type ShapeType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'custom';

/**
 * Shape Component
 * Stores shape-specific metadata
 */
export class Shape extends Component {
  shapeType: ShapeType;
  color: number;
  size: number;
  removable: boolean;
  isGround: boolean;

  // Shape-specific dimensions (optional)
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;

  constructor(data?: {
    shapeType?: ShapeType;
    color?: number;
    size?: number;
    removable?: boolean;
    isGround?: boolean;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
  }) {
    super('Shape');

    this.shapeType = data?.shapeType ?? 'box';
    this.color = data?.color ?? 0xffffff;
    this.size = data?.size ?? 1;
    this.removable = data?.removable ?? true;
    this.isGround = data?.isGround ?? false;
    this.width = data?.width;
    this.height = data?.height;
    this.depth = data?.depth;
    this.radius = data?.radius;
  }

  /**
   * Set shape type
   */
  setShapeType(type: ShapeType): this {
    this.shapeType = type;
    return this;
  }

  /**
   * Set color
   */
  setColor(color: number): this {
    this.color = color;
    return this;
  }

  /**
   * Set size
   */
  setSize(size: number): this {
    this.size = size;
    return this;
  }

  /**
   * Set removable flag
   */
  setRemovable(removable: boolean): this {
    this.removable = removable;
    return this;
  }

  /**
   * Get display name for shape type
   */
  getDisplayName(): string {
    const names: Record<ShapeType, string> = {
      box: 'Box',
      sphere: 'Sphere',
      cylinder: 'Cylinder',
      cone: 'Cone',
      torus: 'Torus',
      custom: 'Custom'
    };
    return names[this.shapeType];
  }

  /**
   * Check if shape can be removed
   */
  canRemove(): boolean {
    return this.removable && !this.isGround;
  }

  /**
   * Clone component
   */
  clone(): Shape {
    return new Shape({
      shapeType: this.shapeType,
      color: this.color,
      size: this.size,
      removable: this.removable,
      isGround: this.isGround,
      width: this.width,
      height: this.height,
      depth: this.depth,
      radius: this.radius
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      shapeType: this.shapeType,
      color: `0x${this.color.toString(16).padStart(6, '0')}`,
      size: this.size,
      removable: this.removable,
      isGround: this.isGround,
      displayName: this.getDisplayName()
    };
  }
}
