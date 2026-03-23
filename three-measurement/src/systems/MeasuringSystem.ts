import * as THREE from 'three';
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Measurement } from '../components/Measurement';
import { Interactive } from '../components/Interactive';
import { Dimension } from '../components/Dimension';
import { Shape } from '../components/Shape';
import type { Unit } from '../utils';
import { formatDistance } from '../utils';

/**
 * MeasuringSystem
 * Handles measurement creation, preview, and management
 */
export class MeasuringSystem extends System {
  private world: World;
  private scene: THREE.Scene;

  // State
  private measuring_active = false;
  private measuring_inProgress = false;
  private startPoint: THREE.Vector3 | null = null;
  private currentUnit: Unit = 'm';
  private measurementCounter = 0;

  // Preview elements
  private previewLine: THREE.Line | null = null;
  private previewLabel: THREE.Sprite | null = null;
  private startMarker: THREE.Mesh | null = null;
  private cursorMarker: THREE.Mesh | null = null;
  private previewLabelCanvas: HTMLCanvasElement | null = null;
  private previewLabelTexture: THREE.CanvasTexture | null = null;

  // Shared materials/geometries
  private dimensionLineMaterial!: THREE.LineBasicMaterial;
  private previewLineMaterial!: THREE.LineDashedMaterial;
  private arrowMaterial!: THREE.MeshBasicMaterial;
  private markerMaterial!: THREE.MeshBasicMaterial;
  private cursorMaterial!: THREE.MeshBasicMaterial;
  private extensionLineMaterial!: THREE.LineBasicMaterial;
  private markerGeometry!: THREE.SphereGeometry;
  private arrowGeometry!: THREE.ConeGeometry;

  // Temp vectors (avoid allocations)
  private static _tempVec = new THREE.Vector3();
  private static _tempVec2 = new THREE.Vector3();
  private static _tempQuat = new THREE.Quaternion();
  private static _upVec = new THREE.Vector3(0, 1, 0);

  constructor(world: World, scene: THREE.Scene, eventBus: EventBus) {
    super('MeasuringSystem', eventBus);
    this.world = world;
    this.scene = scene;
    this.setRequiredComponents('Measurement');
    this.setPriority(30);

    this.initMaterials();
    this.setupEventListeners();
  }

  private initMaterials(): void {
    this.dimensionLineMaterial = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      linewidth: 2
    });

    this.previewLineMaterial = new THREE.LineDashedMaterial({
      color: 0x94a3b8,
      dashSize: 0.15,
      gapSize: 0.1,
      linewidth: 1
    });

    this.arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide
    });

    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x00e5ff
    });

    this.cursorMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd600,
      transparent: true,
      opacity: 0.7
    });

    this.extensionLineMaterial = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.5
    });

    this.markerGeometry = new THREE.SphereGeometry(0.05, 10, 10);
    this.arrowGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);
  }

  private setupEventListeners(): void {
    this.on('measure:activate', () => this.activate());
    this.on('measure:deactivate', () => this.deactivate());
    this.on('measure:toggle', () => {
      if (this.measuring_active) this.deactivate();
      else this.activate();
    });

    this.on('measure:click', (data) => {
      const point = data.point as THREE.Vector3;
      const snappedPoint = data.snappedPoint as THREE.Vector3 | null;
      this.handleClick(snappedPoint ?? point);
    });

    this.on('measure:move', (data) => {
      const point = data.point as THREE.Vector3;
      const snappedPoint = data.snappedPoint as THREE.Vector3 | null;
      this.handleMouseMove(snappedPoint ?? point);
    });

    this.on('measure:cancel', () => this.cancelMeasurement());

    this.on('measure:delete', (data) => {
      this.deleteMeasurement(data.id as string);
    });

    this.on('measure:clear-all', () => this.clearAll());

    this.on('measure:set-unit', (data) => {
      this.setGlobalUnit(data.unit as Unit);
    });

    this.on('measure:cycle-unit', () => {
      this.cycleGlobalUnit();
    });

    // Selection-based shortcuts (E and M keys)
    this.on('selection:delete', () => {
      this.deleteSelectedMeasurement();
    });

    this.on('selection:cycle-unit', () => {
      this.cycleSelectedUnit();
    });
  }

  update(_deltaTime: number): void {
    // Update cursor marker position if measuring
    if (this.measuring_active && this.cursorMarker) {
      this.cursorMarker.visible = true;
    }
  }

  /**
   * Activate measurement mode
   */
  activate(): void {
    this.measuring_active = true;
    this.measuring_inProgress = false;
    this.startPoint = null;
    this.showCursorMarker();
    this.emit('measure:activated', {});
  }

  /**
   * Deactivate measurement mode
   */
  deactivate(): void {
    this.cancelMeasurement();
    this.measuring_active = false;
    this.hideCursorMarker();
    this.emit('measure:deactivated', {});
  }

  /**
   * Handle click during measurement
   */
  handleClick(point: THREE.Vector3): void {
    if (!this.measuring_active) return;

    if (!this.measuring_inProgress) {
      // First click - start measuring
      this.startPoint = point.clone();
      this.measuring_inProgress = true;
      this.showStartMarker(point);
      this.createPreviewLine(point);
      this.emit('measure:started', { point });
    } else {
      // Second click - complete measurement
      this.completeMeasurement(point);
    }
  }

  /**
   * Handle mouse move during measurement
   */
  handleMouseMove(point: THREE.Vector3): void {
    if (!this.measuring_active) return;

    // Update cursor marker
    if (this.cursorMarker) {
      this.cursorMarker.position.copy(point);
    }

    // Update preview line
    if (this.measuring_inProgress && this.previewLine && this.startPoint) {
      const posAttr = this.previewLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      arr[3] = point.x;
      arr[4] = point.y;
      arr[5] = point.z;
      posAttr.needsUpdate = true;
      this.previewLine.geometry.computeBoundingSphere();
      this.previewLine.computeLineDistances();

      // Update preview label
      const dist = this.startPoint.distanceTo(point);
      this.updatePreviewLabel(dist, this.startPoint, point);
    }
  }

  /**
   * Complete measurement and create entity
   */
  private completeMeasurement(endPoint: THREE.Vector3): void {
    if (!this.startPoint) return;

    const distance = this.startPoint.distanceTo(endPoint);

    // Prevent zero/near-zero measurements
    if (distance < 0.01) {
      this.cancelMeasurement();
      return;
    }

    // Create measurement entity
    const id = `measurement_${++this.measurementCounter}`;
    const entity = this.world.createEntity(id);

    // Add Transform
    entity.addComponent(new Transform());

    // Add Measurement component
    const measurement = new Measurement({
      startPoint: this.startPoint,
      endPoint: endPoint,
      unit: this.currentUnit,
      startShapeName: this.detectShapeName(this.startPoint),
      endShapeName: this.detectShapeName(endPoint)
    });
    entity.addComponent(measurement);

    // Add Interactive component
    entity.addComponent(new Interactive({
      selectable: true,
      removable: true,
      draggable: false
    }));

    // Add Dimension component and build visuals
    const dimension = new Dimension();
    entity.addComponent(dimension);
    this.buildDimensionVisuals(dimension, measurement);
    dimension.addToScene(this.scene);

    // Add Renderable pointing to dimension group
    entity.addComponent(new Renderable({
      mesh: dimension.group,
      castShadow: false,
      receiveShadow: false
    }));

    // Tag as measurement
    entity.addTag('measurement');

    // Notify world that entity components changed (so systems can re-inject)
    this.world.entityChanged(entity);

    // Save start point before cleanup
    const savedStartPoint = this.startPoint.clone();

    // Clean up preview
    this.cancelMeasurement();

    this.emit('measure:completed', {
      id,
      distance,
      startPoint: savedStartPoint,
      endPoint: endPoint.clone()
    });
  }

  /**
   * Build dimension visuals for a measurement
   */
  private buildDimensionVisuals(dimension: Dimension, measurement: Measurement): void {
    const start = measurement.startPoint;
    const end = measurement.endPoint;
    const direction = measurement.getDirection();

    // Main dimension line
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(lineGeometry, this.dimensionLineMaterial);
    dimension.setLine(line);

    // Endpoint markers
    const startMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    startMarker.position.copy(start);
    const endMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    endMarker.position.copy(end);
    dimension.setMarkers(startMarker, endMarker);

    // Arrowheads
    const startArrow = this.createArrowHead(start, direction);
    const endArrow = this.createArrowHead(end, direction.clone().negate());
    dimension.setArrows(startArrow, endArrow);

    // Extension lines
    this.createExtensionLines(start, end).forEach(line => {
      dimension.addExtensionLine(line);
    });

    // Label
    const midpoint = measurement.getMidpoint();
    midpoint.y += 0.7;
    const label = this.createTextSprite(measurement.getFormattedDistance(), midpoint);
    dimension.setLabel(label);
    dimension.labelText = measurement.getFormattedDistance();
  }

  /**
   * Create arrowhead mesh
   */
  private createArrowHead(position: THREE.Vector3, direction: THREE.Vector3): THREE.Mesh {
    const cone = new THREE.Mesh(this.arrowGeometry, this.arrowMaterial);
    cone.position.copy(position);

    const dot = MeasuringSystem._upVec.dot(direction);
    if (dot < -0.9999) {
      cone.quaternion.set(1, 0, 0, 0);
    } else {
      MeasuringSystem._tempQuat.setFromUnitVectors(MeasuringSystem._upVec, direction);
      cone.quaternion.copy(MeasuringSystem._tempQuat);
    }

    return cone;
  }

  /**
   * Create extension lines at endpoints
   */
  private createExtensionLines(start: THREE.Vector3, end: THREE.Vector3): THREE.Line[] {
    const tv = MeasuringSystem._tempVec;
    const tv2 = MeasuringSystem._tempVec2;

    const dir = tv.copy(end).sub(start).normalize();
    const perp = tv2.crossVectors(dir, MeasuringSystem._upVec).normalize();
    if (perp.lengthSq() < 0.001) {
      perp.set(1, 0, 0);
    }

    const tickLength = 0.3;
    const lines: THREE.Line[] = [];

    const makeTick = (pt: THREE.Vector3): THREE.Line => {
      const p1 = pt.clone().addScaledVector(perp, tickLength);
      const p2 = pt.clone().addScaledVector(perp, -tickLength);
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      return new THREE.Line(geo, this.extensionLineMaterial);
    };

    lines.push(makeTick(start));
    lines.push(makeTick(end));
    return lines;
  }

  /**
   * Create text label sprite
   */
  private createTextSprite(text: string, position: THREE.Vector3): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 512;
    canvas.height = 128;

    // Background
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
    ctx.beginPath();
    ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 14);
    ctx.fill();

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#00e5ff';
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

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(2.0, 0.5, 1);

    return sprite;
  }

  /**
   * Detect shape name for a point
   */
  private detectShapeName(point: THREE.Vector3): string {
    let closest = 'Ground';
    let minDistSq = 25; // Max 5 units

    const shapeEntities = this.world.getEntitiesWith('Shape', 'Transform');
    for (const entity of shapeEntities) {
      const transform = entity.getComponent<Transform>('Transform');
      const shape = entity.getComponent<Shape>('Shape');

      if (transform && shape && !shape.isGround) {
        const dSq = point.distanceToSquared(transform.position);
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closest = shape.getDisplayName();
        }
      }
    }

    return closest;
  }

  /**
   * Cancel current measurement
   */
  cancelMeasurement(): void {
    if (this.previewLine) {
      this.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine = null;
    }
    if (this.previewLabel) {
      this.scene.remove(this.previewLabel);
      (this.previewLabel.material as THREE.SpriteMaterial).map?.dispose();
      this.previewLabel.material.dispose();
      this.previewLabel = null;
    }
    if (this.startMarker) {
      this.scene.remove(this.startMarker);
      this.startMarker = null;
    }
    if (this.previewLabelTexture) {
      this.previewLabelTexture.dispose();
      this.previewLabelTexture = null;
    }
    this.previewLabelCanvas = null;
    this.startPoint = null;
    this.measuring_inProgress = false;
  }

  /**
   * Delete a measurement entity
   */
  deleteMeasurement(id: string): void {
    const entity = this.world.getEntity(id);
    if (entity) {
      const dimension = entity.getComponent<Dimension>('Dimension');
      if (dimension) {
        dimension.removeFromScene();
        dimension.dispose();
      }
      this.world.removeEntity(id);
      this.emit('measure:deleted', { id });
    }
  }

  /**
   * Clear all measurements
   */
  clearAll(): void {
    this.cancelMeasurement();
    const measurementEntities = this.world.getEntitiesWithTag('measurement');
    for (const entity of measurementEntities) {
      const dimension = entity.getComponent<Dimension>('Dimension');
      if (dimension) {
        dimension.removeFromScene();
        dimension.dispose();
      }
      this.world.removeEntity(entity.id);
    }
    this.emit('measure:cleared', {});
  }

  /**
   * Set global unit for all measurements
   */
  setGlobalUnit(unit: Unit): void {
    this.currentUnit = unit;

    // Update all existing measurements
    for (const entity of this.entities.values()) {
      const measurement = entity.getComponent<Measurement>('Measurement');
      const dimension = entity.getComponent<Dimension>('Dimension');

      if (measurement && dimension) {
        measurement.setUnit(unit);
        this.updateMeasurementLabel(dimension, measurement);
      }
    }

    this.emit('measure:unit-changed', { unit });
  }

  /**
   * Cycle global unit
   */
  cycleGlobalUnit(): void {
    const units: Unit[] = ['m', 'cm', 'ft', 'in'];
    const idx = units.indexOf(this.currentUnit);
    this.setGlobalUnit(units[(idx + 1) % units.length]);
  }

  /**
   * Delete currently selected measurement (E key)
   */
  deleteSelectedMeasurement(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selectionSystem = this.world.getSystem('SelectionSystem') as any;
    const selectedId = selectionSystem?.getSelectedEntityId?.() as string | null;
    if (selectedId) {
      const entity = this.world.getEntity(selectedId);
      if (entity?.hasTag('measurement')) {
        this.deleteMeasurement(selectedId);
      }
    }
  }

  /**
   * Cycle unit of selected measurement (M key)
   */
  cycleSelectedUnit(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selectionSystem = this.world.getSystem('SelectionSystem') as any;
    const selectedId = selectionSystem?.getSelectedEntityId?.() as string | null;
    if (selectedId) {
      const entity = this.world.getEntity(selectedId);
      if (entity?.hasTag('measurement')) {
        const measurement = entity.getComponent<Measurement>('Measurement');
        const dimension = entity.getComponent<Dimension>('Dimension');
        if (measurement && dimension) {
          const units: Unit[] = ['m', 'cm', 'ft', 'in'];
          const idx = units.indexOf(measurement.unit);
          measurement.setUnit(units[(idx + 1) % units.length]);
          this.updateMeasurementLabel(dimension, measurement);
          this.emit('measure:unit-changed', { id: selectedId, unit: measurement.unit });
        }
      }
    }
  }

  /**
   * Update measurement label
   */
  private updateMeasurementLabel(dimension: Dimension, measurement: Measurement): void {
    if (dimension.label) {
      dimension.group.remove(dimension.label);
      (dimension.label.material as THREE.SpriteMaterial).map?.dispose();
      dimension.label.material.dispose();
    }

    const midpoint = measurement.getMidpoint();
    midpoint.y += 0.7;
    const label = this.createTextSprite(measurement.getFormattedDistance(), midpoint);
    dimension.setLabel(label);
  }

  // Preview helper methods
  private showCursorMarker(): void {
    if (!this.cursorMarker) {
      this.cursorMarker = new THREE.Mesh(this.markerGeometry, this.cursorMaterial);
      this.cursorMarker.visible = false;
      this.scene.add(this.cursorMarker);
    }
  }

  private hideCursorMarker(): void {
    if (this.cursorMarker) {
      this.scene.remove(this.cursorMarker);
      this.cursorMarker = null;
    }
  }

  private showStartMarker(point: THREE.Vector3): void {
    this.startMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    this.startMarker.position.copy(point);
    this.scene.add(this.startMarker);
  }

  private createPreviewLine(start: THREE.Vector3): void {
    const positions = new Float32Array(6);
    positions[0] = start.x;
    positions[1] = start.y;
    positions[2] = start.z;
    positions[3] = start.x;
    positions[4] = start.y;
    positions[5] = start.z;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.previewLine = new THREE.Line(geometry, this.previewLineMaterial);
    this.previewLine.computeLineDistances();
    this.scene.add(this.previewLine);
  }

  private updatePreviewLabel(distance: number, start: THREE.Vector3, end: THREE.Vector3): void {
    const text = formatDistance(distance, this.currentUnit);

    if (!this.previewLabelCanvas) {
      this.previewLabelCanvas = document.createElement('canvas');
      this.previewLabelCanvas.width = 256;
      this.previewLabelCanvas.height = 64;
    }

    if (!this.previewLabelTexture) {
      this.previewLabelTexture = new THREE.CanvasTexture(this.previewLabelCanvas);
    }

    if (!this.previewLabel) {
      const mat = new THREE.SpriteMaterial({
        map: this.previewLabelTexture,
        transparent: true,
        depthTest: true,
        depthWrite: false
      });
      this.previewLabel = new THREE.Sprite(mat);
      this.previewLabel.scale.set(1.8, 0.45, 1);
      this.scene.add(this.previewLabel);
    }

    // Repaint canvas
    const ctx = this.previewLabelCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.previewLabelCanvas.width, this.previewLabelCanvas.height);

    ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
    ctx.beginPath();
    ctx.roundRect(4, 4, this.previewLabelCanvas.width - 8, this.previewLabelCanvas.height - 8, 10);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.previewLabelCanvas.width / 2, this.previewLabelCanvas.height / 2);

    this.previewLabelTexture.needsUpdate = true;

    // Position at midpoint
    const mid = MeasuringSystem._tempVec.copy(start).lerp(end, 0.5);
    mid.y += 0.5;
    this.previewLabel.position.copy(mid);
  }

  // Getters
  isMeasureActive(): boolean { return this.measuring_active; }
  isMeasureInProgress(): boolean { return this.measuring_inProgress; }
  get unit(): Unit { return this.currentUnit; }
  get measurementCount(): number { return this.entities.size; }

  /**
   * Get measurement records for UI
   */
  getMeasurementRecords(): Array<{
    id: string;
    index: number;
    startShape: string;
    endShape: string;
    distance: number;
    formattedDistance: string;
    unit: Unit;
  }> {
    const records: Array<{
      id: string;
      index: number;
      startShape: string;
      endShape: string;
      distance: number;
      formattedDistance: string;
      unit: Unit;
    }> = [];

    let idx = 1;
    for (const entity of this.entities.values()) {
      const measurement = entity.getComponent<Measurement>('Measurement');
      if (measurement && measurement.isComplete) {
        records.push({
          id: entity.id,
          index: idx++,
          startShape: measurement.startShapeName,
          endShape: measurement.endShapeName,
          distance: measurement.distance,
          formattedDistance: measurement.getFormattedDistance(),
          unit: measurement.unit
        });
      }
    }

    return records;
  }

  onDestroy(): void {
    this.cancelMeasurement();
    this.hideCursorMarker();

    this.dimensionLineMaterial.dispose();
    this.previewLineMaterial.dispose();
    this.arrowMaterial.dispose();
    this.markerMaterial.dispose();
    this.cursorMaterial.dispose();
    this.extensionLineMaterial.dispose();
    this.markerGeometry.dispose();
    this.arrowGeometry.dispose();
  }
}
