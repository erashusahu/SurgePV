import * as THREE from 'three';
import { Component } from '../ecs/Component';

/**
 * Dimension Component
 * Stores visual dimension rendering data (lines, arrows, labels)
 */
export class Dimension extends Component {
  // Main container group
  group: THREE.Group;

  // Visual elements
  line: THREE.Line | null = null;
  startMarker: THREE.Mesh | null = null;
  endMarker: THREE.Mesh | null = null;
  startArrow: THREE.Mesh | null = null;
  endArrow: THREE.Mesh | null = null;
  extensionLines: THREE.Line[] = [];
  label: THREE.Sprite | null = null;

  // Label canvas for text rendering
  labelCanvas: HTMLCanvasElement | null = null;
  labelTexture: THREE.CanvasTexture | null = null;

  // State
  visible = true;
  highlighted = false;
  labelText = '';

  constructor(data?: {
    visible?: boolean;
  }) {
    super('Dimension');

    this.group = new THREE.Group();
    this.group.name = 'measurement';
    this.visible = data?.visible ?? true;
  }

  /**
   * Set visibility of all dimension elements
   */
  setVisible(visible: boolean): this {
    this.visible = visible;
    this.group.visible = visible;
    return this;
  }

  /**
   * Toggle visibility
   */
  toggleVisible(): this {
    return this.setVisible(!this.visible);
  }

  /**
   * Set highlighted state (for selection)
   */
  setHighlighted(highlighted: boolean): this {
    this.highlighted = highlighted;
    return this;
  }

  /**
   * Set the main dimension line
   */
  setLine(line: THREE.Line): this {
    if (this.line) {
      this.group.remove(this.line);
    }
    this.line = line;
    this.group.add(line);
    return this;
  }

  /**
   * Set endpoint markers
   */
  setMarkers(startMarker: THREE.Mesh, endMarker: THREE.Mesh): this {
    if (this.startMarker) this.group.remove(this.startMarker);
    if (this.endMarker) this.group.remove(this.endMarker);

    this.startMarker = startMarker;
    this.endMarker = endMarker;
    this.group.add(startMarker);
    this.group.add(endMarker);
    return this;
  }

  /**
   * Set arrowheads
   */
  setArrows(startArrow: THREE.Mesh, endArrow: THREE.Mesh): this {
    if (this.startArrow) this.group.remove(this.startArrow);
    if (this.endArrow) this.group.remove(this.endArrow);

    this.startArrow = startArrow;
    this.endArrow = endArrow;
    this.group.add(startArrow);
    this.group.add(endArrow);
    return this;
  }

  /**
   * Add extension line
   */
  addExtensionLine(line: THREE.Line): this {
    this.extensionLines.push(line);
    this.group.add(line);
    return this;
  }

  /**
   * Set label sprite
   */
  setLabel(label: THREE.Sprite): this {
    if (this.label) {
      this.group.remove(this.label);
    }
    this.label = label;
    this.group.add(label);
    return this;
  }

  /**
   * Update label text
   */
  updateLabelText(text: string): this {
    this.labelText = text;

    if (this.label && this.labelCanvas) {
      const ctx = this.labelCanvas.getContext('2d');
      if (ctx) {
        this.renderLabelText(ctx, text);
        if (this.labelTexture) {
          this.labelTexture.needsUpdate = true;
        }
      }
    }
    return this;
  }

  /**
   * Render text to label canvas
   */
  private renderLabelText(ctx: CanvasRenderingContext2D, text: string): void {
    const canvas = this.labelCanvas!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
    ctx.beginPath();
    ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 14);
    ctx.fill();

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.highlighted ? '#ffd600' : '#00e5ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  /**
   * Add group to scene
   */
  addToScene(scene: THREE.Scene): this {
    if (!this.group.parent) {
      scene.add(this.group);
    }
    return this;
  }

  /**
   * Remove group from scene
   */
  removeFromScene(): this {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    return this;
  }

  /**
   * Clear all visual elements
   */
  clear(): this {
    // Remove all children
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }

    this.line = null;
    this.startMarker = null;
    this.endMarker = null;
    this.startArrow = null;
    this.endArrow = null;
    this.extensionLines = [];
    this.label = null;

    return this;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    // Dispose geometries and materials
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of materials) {
            (mat as THREE.MeshBasicMaterial).map?.dispose();
            mat.dispose();
          }
        }
      }
      if (obj instanceof THREE.Sprite) {
        (obj.material as THREE.SpriteMaterial).map?.dispose();
        obj.material.dispose();
      }
    });

    if (this.labelTexture) {
      this.labelTexture.dispose();
    }

    this.clear();
  }

  /**
   * Clone component
   */
  clone(): Dimension {
    const cloned = new Dimension({
      visible: this.visible
    });
    cloned.labelText = this.labelText;
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      visible: this.visible,
      highlighted: this.highlighted,
      labelText: this.labelText,
      hasLine: this.line !== null,
      hasLabel: this.label !== null,
      extensionLineCount: this.extensionLines.length
    };
  }
}
