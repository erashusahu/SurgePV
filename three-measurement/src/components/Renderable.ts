import * as THREE from 'three';
import { Component } from '../ecs/Component';

/**
 * Renderable Component
 * Stores Three.js mesh reference and rendering properties
 */
export class Renderable extends Component {
  mesh: THREE.Object3D;
  originalMaterial: THREE.Material | THREE.Material[] | null = null;
  visible = true;
  castShadow = true;
  receiveShadow = true;
  layer = 0;

  constructor(data: {
    mesh: THREE.Object3D;
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    layer?: number;
  }) {
    super('Renderable');

    this.mesh = data.mesh;
    this.visible = data.visible ?? true;
    this.castShadow = data.castShadow ?? true;
    this.receiveShadow = data.receiveShadow ?? true;
    this.layer = data.layer ?? 0;

    // Store original material for restoration
    if (this.mesh instanceof THREE.Mesh) {
      this.originalMaterial = this.mesh.material;
    }

    // Apply initial properties
    this.syncToMesh();
  }

  /**
   * Sync component properties to mesh
   */
  syncToMesh(): void {
    this.mesh.visible = this.visible;
    if (this.mesh instanceof THREE.Mesh) {
      this.mesh.castShadow = this.castShadow;
      this.mesh.receiveShadow = this.receiveShadow;
    }
    this.mesh.layers.set(this.layer);
  }

  /**
   * Set visibility
   */
  setVisible(visible: boolean): this {
    this.visible = visible;
    this.mesh.visible = visible;
    return this;
  }

  /**
   * Toggle visibility
   */
  toggleVisible(): this {
    return this.setVisible(!this.visible);
  }

  /**
   * Set material (for Mesh objects)
   */
  setMaterial(material: THREE.Material): this {
    if (this.mesh instanceof THREE.Mesh) {
      this.mesh.material = material;
    }
    return this;
  }

  /**
   * Restore original material
   */
  restoreMaterial(): this {
    if (this.mesh instanceof THREE.Mesh && this.originalMaterial) {
      this.mesh.material = this.originalMaterial;
    }
    return this;
  }

  /**
   * Get current material
   */
  getMaterial(): THREE.Material | THREE.Material[] | null {
    if (this.mesh instanceof THREE.Mesh) {
      return this.mesh.material;
    }
    return null;
  }

  /**
   * Set render layer
   */
  setLayer(layer: number): this {
    this.layer = layer;
    this.mesh.layers.set(layer);
    return this;
  }

  /**
   * Add mesh to scene
   */
  addToScene(scene: THREE.Scene): this {
    if (!this.mesh.parent) {
      scene.add(this.mesh);
    }
    return this;
  }

  /**
   * Remove mesh from scene
   */
  removeFromScene(): this {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    return this;
  }

  /**
   * Dispose of mesh resources
   */
  dispose(): void {
    if (this.mesh instanceof THREE.Mesh) {
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      if (this.mesh.material) {
        const materials = Array.isArray(this.mesh.material)
          ? this.mesh.material
          : [this.mesh.material];
        for (const mat of materials) {
          if ((mat as THREE.MeshStandardMaterial).map) {
            (mat as THREE.MeshStandardMaterial).map?.dispose();
          }
          mat.dispose();
        }
      }
    }
  }

  /**
   * Clone component
   */
  clone(): Renderable {
    return new Renderable({
      mesh: this.mesh.clone(),
      visible: this.visible,
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      layer: this.layer
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      visible: this.visible,
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      layer: this.layer,
      meshType: this.mesh.type
    };
  }
}
