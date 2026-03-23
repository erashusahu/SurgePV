import * as THREE from 'three';
import { Component } from '../ecs/Component';

/**
 * Transform Component
 * Stores position, rotation, and scale in 3D space
 */
export class Transform extends Component {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  quaternion: THREE.Quaternion;
  dirty = true; // Flag to indicate transform needs sync

  constructor(data?: {
    position?: [number, number, number] | THREE.Vector3;
    rotation?: [number, number, number] | THREE.Euler;
    scale?: [number, number, number] | THREE.Vector3;
  }) {
    super('Transform');

    // Position
    if (data?.position instanceof THREE.Vector3) {
      this.position = data.position.clone();
    } else if (Array.isArray(data?.position)) {
      this.position = new THREE.Vector3(...data.position);
    } else {
      this.position = new THREE.Vector3(0, 0, 0);
    }

    // Rotation (Euler)
    if (data?.rotation instanceof THREE.Euler) {
      this.rotation = data.rotation.clone();
    } else if (Array.isArray(data?.rotation)) {
      this.rotation = new THREE.Euler(...data.rotation);
    } else {
      this.rotation = new THREE.Euler(0, 0, 0);
    }

    // Scale
    if (data?.scale instanceof THREE.Vector3) {
      this.scale = data.scale.clone();
    } else if (Array.isArray(data?.scale)) {
      this.scale = new THREE.Vector3(...data.scale);
    } else {
      this.scale = new THREE.Vector3(1, 1, 1);
    }

    // Quaternion (derived from rotation)
    this.quaternion = new THREE.Quaternion();
    this.quaternion.setFromEuler(this.rotation);
  }

  /**
   * Set position
   */
  setPosition(x: number, y: number, z: number): this {
    this.position.set(x, y, z);
    this.dirty = true;
    return this;
  }

  /**
   * Copy position from Vector3
   */
  copyPosition(v: THREE.Vector3): this {
    this.position.copy(v);
    this.dirty = true;
    return this;
  }

  /**
   * Set rotation from Euler angles (in radians)
   */
  setRotation(x: number, y: number, z: number): this {
    this.rotation.set(x, y, z);
    this.quaternion.setFromEuler(this.rotation);
    this.dirty = true;
    return this;
  }

  /**
   * Set scale
   */
  setScale(x: number, y: number, z: number): this {
    this.scale.set(x, y, z);
    this.dirty = true;
    return this;
  }

  /**
   * Set uniform scale
   */
  setUniformScale(s: number): this {
    this.scale.set(s, s, s);
    this.dirty = true;
    return this;
  }

  /**
   * Apply rotation from quaternion
   */
  setQuaternion(quat: THREE.Quaternion): this {
    this.quaternion.copy(quat);
    this.rotation.setFromQuaternion(this.quaternion);
    this.dirty = true;
    return this;
  }

  /**
   * Translate position
   */
  translate(dx: number, dy: number, dz: number): this {
    this.position.x += dx;
    this.position.y += dy;
    this.position.z += dz;
    this.dirty = true;
    return this;
  }

  /**
   * Look at a target position
   */
  lookAt(target: THREE.Vector3): this {
    const matrix = new THREE.Matrix4();
    matrix.lookAt(this.position, target, new THREE.Vector3(0, 1, 0));
    this.quaternion.setFromRotationMatrix(matrix);
    this.rotation.setFromQuaternion(this.quaternion);
    this.dirty = true;
    return this;
  }

  /**
   * Get world matrix
   */
  getMatrix(): THREE.Matrix4 {
    const matrix = new THREE.Matrix4();
    matrix.compose(this.position, this.quaternion, this.scale);
    return matrix;
  }

  /**
   * Apply transform to a Three.js Object3D
   */
  applyTo(object: THREE.Object3D): void {
    object.position.copy(this.position);
    object.quaternion.copy(this.quaternion);
    object.scale.copy(this.scale);
    this.dirty = false;
  }

  /**
   * Copy transform from a Three.js Object3D
   */
  copyFrom(object: THREE.Object3D): this {
    this.position.copy(object.position);
    this.quaternion.copy(object.quaternion);
    this.rotation.setFromQuaternion(this.quaternion);
    this.scale.copy(object.scale);
    this.dirty = true;
    return this;
  }

  /**
   * Clone component
   */
  clone(): Transform {
    const cloned = new Transform({
      position: this.position.clone(),
      rotation: this.rotation.clone(),
      scale: this.scale.clone()
    });
    cloned.quaternion.copy(this.quaternion);
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      position: [this.position.x, this.position.y, this.position.z],
      rotation: [this.rotation.x, this.rotation.y, this.rotation.z],
      scale: [this.scale.x, this.scale.y, this.scale.z]
    };
  }
}
