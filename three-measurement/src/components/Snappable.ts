import * as THREE from 'three';
import { Component } from '../ecs/Component';

/**
 * Snap result type
 */
export interface SnapResult {
  vertex: THREE.Vector3;
  distance: number;
  index: number;
}

/**
 * Snappable Component
 * Stores vertex data for snap-to-vertex functionality
 */
export class Snappable extends Component {
  vertices: THREE.Vector3[] = [];
  snapRadius = 0.6;
  enabled = true;
  private geometryVersion = 0;
  private cachedWorldVertices: THREE.Vector3[] = [];
  private cacheValid = false;

  // Spatial hash for fast lookups
  private spatialHash = new Map<string, number[]>();
  private hashCellSize = 1.0;

  constructor(data?: {
    vertices?: THREE.Vector3[];
    snapRadius?: number;
    enabled?: boolean;
  }) {
    super('Snappable');

    if (data?.vertices) {
      this.setVertices(data.vertices);
    }
    this.snapRadius = data?.snapRadius ?? 0.6;
    this.enabled = data?.enabled ?? true;
  }

  /**
   * Set vertices for snapping
   */
  setVertices(vertices: THREE.Vector3[]): this {
    this.vertices = vertices.map(v => v.clone());
    this.geometryVersion++;
    this.invalidateCache();
    return this;
  }

  /**
   * Extract vertices from a mesh geometry
   */
  extractFromMesh(mesh: THREE.Mesh): this {
    const geometry = mesh.geometry;
    if (!geometry) return this;

    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return this;

    const vertices: THREE.Vector3[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3(
        posAttr.getX(i),
        posAttr.getY(i),
        posAttr.getZ(i)
      );

      // Deduplicate vertices (round to 3 decimals)
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        vertices.push(v);
      }
    }

    this.vertices = vertices;
    this.geometryVersion++;
    this.invalidateCache();
    return this;
  }

  /**
   * Update world-space vertices using mesh transform
   */
  updateWorldVertices(mesh: THREE.Mesh): this {
    mesh.updateWorldMatrix(true, false);

    this.cachedWorldVertices = this.vertices.map(v => {
      const worldV = v.clone();
      worldV.applyMatrix4(mesh.matrixWorld);
      return worldV;
    });

    this.buildSpatialHash();
    this.cacheValid = true;
    return this;
  }

  /**
   * Build spatial hash for O(1) neighbor lookups
   */
  private buildSpatialHash(): void {
    this.spatialHash.clear();

    for (let i = 0; i < this.cachedWorldVertices.length; i++) {
      const v = this.cachedWorldVertices[i];
      const hash = this.getHashKey(v.x, v.y, v.z);

      if (!this.spatialHash.has(hash)) {
        this.spatialHash.set(hash, []);
      }
      this.spatialHash.get(hash)!.push(i);
    }
  }

  /**
   * Get spatial hash key for position
   */
  private getHashKey(x: number, y: number, z: number): string {
    const ix = Math.floor(x / this.hashCellSize);
    const iy = Math.floor(y / this.hashCellSize);
    const iz = Math.floor(z / this.hashCellSize);
    return `${ix},${iy},${iz}`;
  }

  /**
   * Find nearest vertex to a point within snap radius
   */
  findNearestVertex(point: THREE.Vector3, maxDistance?: number): SnapResult | null {
    if (!this.enabled || this.cachedWorldVertices.length === 0) {
      return null;
    }

    const searchRadius = maxDistance ?? this.snapRadius;
    const searchRadiusSq = searchRadius * searchRadius;

    let nearestDist = searchRadiusSq;
    let nearestIdx = -1;
    let nearestVertex: THREE.Vector3 | null = null;

    // Search neighboring cells in spatial hash
    const cellsToSearch = Math.ceil(searchRadius / this.hashCellSize);

    const cx = Math.floor(point.x / this.hashCellSize);
    const cy = Math.floor(point.y / this.hashCellSize);
    const cz = Math.floor(point.z / this.hashCellSize);

    for (let dx = -cellsToSearch; dx <= cellsToSearch; dx++) {
      for (let dy = -cellsToSearch; dy <= cellsToSearch; dy++) {
        for (let dz = -cellsToSearch; dz <= cellsToSearch; dz++) {
          const hash = `${cx + dx},${cy + dy},${cz + dz}`;
          const indices = this.spatialHash.get(hash);

          if (indices) {
            for (const idx of indices) {
              const v = this.cachedWorldVertices[idx];
              const distSq = point.distanceToSquared(v);

              if (distSq < nearestDist) {
                nearestDist = distSq;
                nearestIdx = idx;
                nearestVertex = v;
              }
            }
          }
        }
      }
    }

    if (nearestVertex === null) {
      return null;
    }

    return {
      vertex: nearestVertex.clone(),
      distance: Math.sqrt(nearestDist),
      index: nearestIdx
    };
  }

  /**
   * Invalidate cached vertices (call when transform changes)
   */
  invalidateCache(): this {
    this.cacheValid = false;
    this.cachedWorldVertices = [];
    this.spatialHash.clear();
    return this;
  }

  /**
   * Check if cache is valid
   */
  isCacheValid(): boolean {
    return this.cacheValid;
  }

  /**
   * Get vertex count
   */
  getVertexCount(): number {
    return this.vertices.length;
  }

  /**
   * Clone component
   */
  clone(): Snappable {
    const cloned = new Snappable({
      vertices: this.vertices.map(v => v.clone()),
      snapRadius: this.snapRadius,
      enabled: this.enabled
    });
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      vertexCount: this.vertices.length,
      snapRadius: this.snapRadius,
      enabled: this.enabled,
      cacheValid: this.cacheValid
    };
  }
}
