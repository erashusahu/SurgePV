import * as THREE from 'three';
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Interactive } from '../components/Interactive';
import { Snappable } from '../components/Snappable';
import { Shape } from '../components/Shape';
import type { ShapeType } from '../components/Shape';

/**
 * ShapeSystem
 * Manages shape creation, removal, and undo functionality
 */
export class ShapeSystem extends System {
  private world: World;
  private scene: THREE.Scene;
  private shapeCounter = 0;
  private undoStack: Array<{ entity: ReturnType<World['getEntity']>; mesh: THREE.Mesh }> = [];
  private maxUndoSteps = 20;

  // Shape colors palette
  private static COLORS = [
    0xff6b6b, 0x6c63ff, 0x00d2ff, 0xffd600,
    0x4caf50, 0xff9800, 0xe91e63, 0x9c27b0
  ];

  constructor(world: World, scene: THREE.Scene, eventBus: EventBus) {
    super('ShapeSystem', eventBus);
    this.world = world;
    this.scene = scene;
    this.setRequiredComponents('Shape');
    this.setPriority(20);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.on('shape:add', (data) => {
      this.addShape(data.type as ShapeType);
    });

    this.on('shape:remove', (data) => {
      this.removeShape(data.id as string);
    });

    this.on('shape:undo', () => {
      this.undoRemove();
    });
  }

  update(_deltaTime: number): void {
    // Shape system is event-driven
  }

  /**
   * Add a new shape to the scene
   */
  addShape(type: ShapeType): string {
    const id = `shape_${++this.shapeCounter}`;
    const color = ShapeSystem.COLORS[Math.floor(Math.random() * ShapeSystem.COLORS.length)];

    // Create geometry and material
    const { geometry, yOffset } = this.createGeometry(type);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.3
    });

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    const pos = this.findSpacedPosition(3.0);
    mesh.position.set(pos.x, yOffset, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add to scene
    this.scene.add(mesh);

    // Create entity
    const entity = this.world.createEntity(id);

    // Add components
    entity.addComponent(new Transform({
      position: [pos.x, yOffset, pos.z]
    }));

    entity.addComponent(new Renderable({
      mesh,
      castShadow: true,
      receiveShadow: true
    }));

    entity.addComponent(new Interactive({
      selectable: true,
      draggable: true,
      removable: true
    }));

    const snappable = new Snappable({ snapRadius: 0.6 });
    snappable.extractFromMesh(mesh);
    snappable.updateWorldVertices(mesh);
    entity.addComponent(snappable);

    entity.addComponent(new Shape({
      shapeType: type,
      color,
      removable: true
    }));

    entity.addTag('shape');

    // Notify world so systems can inject this entity
    this.world.entityChanged(entity);

    this.emit('shape:added', { id, type });
    return id;
  }

  /**
   * Create geometry for shape type
   */
  private createGeometry(type: ShapeType): { geometry: THREE.BufferGeometry; yOffset: number } {
    let geometry: THREE.BufferGeometry;
    let yOffset = 1;

    switch (type) {
      case 'box':
        geometry = new THREE.BoxGeometry(
          1.5 + Math.random(),
          1.5 + Math.random(),
          1.5 + Math.random()
        );
        yOffset = 1;
        break;

      case 'sphere': {
        const r = 0.6 + Math.random() * 0.6;
        geometry = new THREE.SphereGeometry(r, 24, 24);
        yOffset = r;
        break;
      }

      case 'cylinder': {
        const cr = 0.4 + Math.random() * 0.5;
        const ch = 1.5 + Math.random() * 1.5;
        geometry = new THREE.CylinderGeometry(cr, cr, ch, 24);
        yOffset = ch / 2;
        break;
      }

      case 'cone': {
        const coneR = 0.5 + Math.random() * 0.5;
        const coneH = 1.5 + Math.random() * 1.5;
        geometry = new THREE.ConeGeometry(coneR, coneH, 24);
        yOffset = coneH / 2;
        break;
      }

      case 'torus':
        geometry = new THREE.TorusGeometry(
          0.6 + Math.random() * 0.3,
          0.2 + Math.random() * 0.15,
          16,
          32
        );
        yOffset = 0.8;
        break;

      default:
        geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    }

    return { geometry, yOffset };
  }

  /**
   * Find a position away from existing shapes
   */
  private findSpacedPosition(minDist: number): { x: number; z: number } {
    const spread = 9;
    const minDistSq = minDist * minDist;
    let bestPos = { x: 0, z: 0 };
    let bestMinDistSq = -1;

    const existingPositions: THREE.Vector3[] = [];
    for (const entity of this.entities.values()) {
      const transform = entity.getComponent<Transform>('Transform');
      if (transform) {
        existingPositions.push(transform.position);
      }
    }

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = (Math.random() - 0.5) * spread * 2;
      const z = (Math.random() - 0.5) * spread * 2;

      let closestDistSq = Infinity;
      for (const pos of existingPositions) {
        const dx = pos.x - x;
        const dz = pos.z - z;
        const dSq = dx * dx + dz * dz;
        if (dSq < closestDistSq) closestDistSq = dSq;
      }

      if (closestDistSq >= minDistSq) {
        return { x, z };
      }

      if (closestDistSq > bestMinDistSq) {
        bestMinDistSq = closestDistSq;
        bestPos = { x, z };
      }
    }

    return bestPos;
  }

  /**
   * Remove a shape
   */
  removeShape(id: string): boolean {
    const entity = this.world.getEntity(id);
    if (!entity) return false;

    const shape = entity.getComponent<Shape>('Shape');
    if (!shape?.canRemove()) return false;

    const renderable = entity.getComponent<Renderable>('Renderable');
    if (renderable) {
      // Store for undo
      this.undoStack.push({
        entity: entity,
        mesh: renderable.mesh as THREE.Mesh
      });

      // Limit undo stack
      if (this.undoStack.length > this.maxUndoSteps) {
        const oldest = this.undoStack.shift();
        if (oldest) {
          this.disposeShapeMesh(oldest.mesh);
        }
      }

      // Remove from scene but keep entity data for undo
      this.scene.remove(renderable.mesh);
    }

    this.world.removeEntity(id);
    this.emit('shape:removed', { id });
    return true;
  }

  /**
   * Undo last shape removal
   */
  undoRemove(): boolean {
    if (this.undoStack.length === 0) return false;

    const { mesh } = this.undoStack.pop()!;

    // Re-add mesh to scene
    this.scene.add(mesh);

    // Create new entity with same properties
    const id = `shape_${++this.shapeCounter}`;
    const entity = this.world.createEntity(id);

    entity.addComponent(new Transform({
      position: [mesh.position.x, mesh.position.y, mesh.position.z]
    }));

    entity.addComponent(new Renderable({
      mesh,
      castShadow: true,
      receiveShadow: true
    }));

    entity.addComponent(new Interactive({
      selectable: true,
      draggable: true,
      removable: true
    }));

    const snappable = new Snappable({ snapRadius: 0.6 });
    snappable.extractFromMesh(mesh);
    snappable.updateWorldVertices(mesh);
    entity.addComponent(snappable);

    entity.addComponent(new Shape({
      shapeType: this.detectShapeType(mesh),
      color: this.getMeshColor(mesh),
      removable: true
    }));

    entity.addTag('shape');

    // Notify world so systems can inject this entity
    this.world.entityChanged(entity);

    this.emit('shape:undone', { id });
    this.emit('snap:invalidate', {});
    return true;
  }

  /**
   * Detect shape type from mesh geometry
   */
  private detectShapeType(mesh: THREE.Mesh): ShapeType {
    const geoType = mesh.geometry?.type ?? '';
    if (geoType.includes('Box')) return 'box';
    if (geoType.includes('Sphere')) return 'sphere';
    if (geoType.includes('Cylinder')) return 'cylinder';
    if (geoType.includes('Cone')) return 'cone';
    if (geoType.includes('Torus')) return 'torus';
    return 'custom';
  }

  /**
   * Get mesh color
   */
  private getMeshColor(mesh: THREE.Mesh): number {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    return mat?.color?.getHex() ?? 0xffffff;
  }

  /**
   * Dispose mesh resources
   */
  private disposeShapeMesh(mesh: THREE.Mesh): void {
    mesh.geometry?.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        mat.dispose();
      }
    }
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Get undo stack size
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  onDestroy(): void {
    // Dispose all undo stack meshes
    for (const { mesh } of this.undoStack) {
      this.disposeShapeMesh(mesh);
    }
    this.undoStack = [];
  }
}
