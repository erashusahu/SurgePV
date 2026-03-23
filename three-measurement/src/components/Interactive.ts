import { Component } from '../ecs/Component';

/**
 * App interaction modes
 */
export type InteractionMode = 'idle' | 'measuring' | 'removing' | 'moving';

/**
 * Interactive Component
 * Stores interaction state (selection, hover, dragging, mode)
 */
export class Interactive extends Component {
  selected = false;
  hovered = false;
  dragging = false;
  selectable = true;
  hoverable = true;
  draggable = false;
  removable = false;
  clickable = true;

  constructor(data?: {
    selectable?: boolean;
    hoverable?: boolean;
    draggable?: boolean;
    removable?: boolean;
    clickable?: boolean;
  }) {
    super('Interactive');

    this.selectable = data?.selectable ?? true;
    this.hoverable = data?.hoverable ?? true;
    this.draggable = data?.draggable ?? false;
    this.removable = data?.removable ?? false;
    this.clickable = data?.clickable ?? true;
  }

  /**
   * Set selected state
   */
  setSelected(selected: boolean): this {
    if (this.selectable) {
      this.selected = selected;
    }
    return this;
  }

  /**
   * Toggle selection
   */
  toggleSelected(): this {
    if (this.selectable) {
      this.selected = !this.selected;
    }
    return this;
  }

  /**
   * Set hovered state
   */
  setHovered(hovered: boolean): this {
    if (this.hoverable) {
      this.hovered = hovered;
    }
    return this;
  }

  /**
   * Set dragging state
   */
  setDragging(dragging: boolean): this {
    if (this.draggable) {
      this.dragging = dragging;
    }
    return this;
  }

  /**
   * Check if can be selected
   */
  canSelect(): boolean {
    return this.selectable;
  }

  /**
   * Check if can be removed
   */
  canRemove(): boolean {
    return this.removable;
  }

  /**
   * Check if can be dragged
   */
  canDrag(): boolean {
    return this.draggable;
  }

  /**
   * Check if can be clicked
   */
  canClick(): boolean {
    return this.clickable;
  }

  /**
   * Reset interaction state
   */
  reset(): this {
    this.selected = false;
    this.hovered = false;
    this.dragging = false;
    return this;
  }

  /**
   * Clone component
   */
  clone(): Interactive {
    const cloned = new Interactive({
      selectable: this.selectable,
      hoverable: this.hoverable,
      draggable: this.draggable,
      removable: this.removable,
      clickable: this.clickable
    });
    cloned.selected = this.selected;
    cloned.hovered = this.hovered;
    cloned.dragging = this.dragging;
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      selected: this.selected,
      hovered: this.hovered,
      dragging: this.dragging,
      selectable: this.selectable,
      hoverable: this.hoverable,
      draggable: this.draggable,
      removable: this.removable,
      clickable: this.clickable
    };
  }
}
