import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Unit } from '../utils';

/**
 * Measurement Component
 * Stores measurement data (start/end points, distance, unit)
 */
export class Measurement extends Component {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  distance = 0;
  unit: Unit = 'm';
  startShapeName = 'Ground';
  endShapeName = 'Ground';
  isComplete = false;
  createdAt: number;

  // Unit conversion factors
  private static readonly UNIT_FACTORS: Record<Unit, number> = {
    m: 1,
    cm: 100,
    ft: 3.28084,
    in: 39.3701
  };

  private static readonly UNIT_LABELS: Record<Unit, string> = {
    m: 'm',
    cm: 'cm',
    ft: 'ft',
    in: 'in'
  };

  constructor(data?: {
    startPoint?: THREE.Vector3 | [number, number, number];
    endPoint?: THREE.Vector3 | [number, number, number];
    unit?: Unit;
    startShapeName?: string;
    endShapeName?: string;
  }) {
    super('Measurement');

    // Start point
    if (data?.startPoint instanceof THREE.Vector3) {
      this.startPoint = data.startPoint.clone();
    } else if (Array.isArray(data?.startPoint)) {
      this.startPoint = new THREE.Vector3(...data.startPoint);
    } else {
      this.startPoint = new THREE.Vector3();
    }

    // End point
    if (data?.endPoint instanceof THREE.Vector3) {
      this.endPoint = data.endPoint.clone();
    } else if (Array.isArray(data?.endPoint)) {
      this.endPoint = new THREE.Vector3(...data.endPoint);
    } else {
      this.endPoint = new THREE.Vector3();
    }

    this.unit = data?.unit ?? 'm';
    this.startShapeName = data?.startShapeName ?? 'Ground';
    this.endShapeName = data?.endShapeName ?? 'Ground';
    this.createdAt = Date.now();

    // Calculate distance if both points provided
    if (data?.startPoint && data?.endPoint) {
      this.calculateDistance();
      this.isComplete = true;
    }
  }

  /**
   * Set start point
   */
  setStartPoint(point: THREE.Vector3, shapeName?: string): this {
    this.startPoint.copy(point);
    if (shapeName) {
      this.startShapeName = shapeName;
    }
    return this;
  }

  /**
   * Set end point and calculate distance
   */
  setEndPoint(point: THREE.Vector3, shapeName?: string): this {
    this.endPoint.copy(point);
    if (shapeName) {
      this.endShapeName = shapeName;
    }
    this.calculateDistance();
    this.isComplete = true;
    return this;
  }

  /**
   * Set both points at once
   */
  setPoints(start: THREE.Vector3, end: THREE.Vector3): this {
    this.startPoint.copy(start);
    this.endPoint.copy(end);
    this.calculateDistance();
    this.isComplete = true;
    return this;
  }

  /**
   * Calculate distance between points
   */
  calculateDistance(): number {
    this.distance = this.startPoint.distanceTo(this.endPoint);
    return this.distance;
  }

  /**
   * Get distance in current unit
   */
  getConvertedDistance(): number {
    return this.distance * Measurement.UNIT_FACTORS[this.unit];
  }

  /**
   * Get formatted distance string
   */
  getFormattedDistance(): string {
    const converted = this.getConvertedDistance();
    return `${converted.toFixed(2)} ${Measurement.UNIT_LABELS[this.unit]}`;
  }

  /**
   * Set unit
   */
  setUnit(unit: Unit): this {
    this.unit = unit;
    return this;
  }

  /**
   * Cycle to next unit
   */
  cycleUnit(): this {
    const units: Unit[] = ['m', 'cm', 'ft', 'in'];
    const idx = units.indexOf(this.unit);
    this.unit = units[(idx + 1) % units.length];
    return this;
  }

  /**
   * Get midpoint between start and end
   */
  getMidpoint(): THREE.Vector3 {
    return this.startPoint.clone().lerp(this.endPoint, 0.5);
  }

  /**
   * Get direction vector (normalized)
   */
  getDirection(): THREE.Vector3 {
    return this.endPoint.clone().sub(this.startPoint).normalize();
  }

  /**
   * Clone component
   */
  clone(): Measurement {
    const cloned = new Measurement({
      startPoint: this.startPoint.clone(),
      endPoint: this.endPoint.clone(),
      unit: this.unit,
      startShapeName: this.startShapeName,
      endShapeName: this.endShapeName
    });
    cloned.distance = this.distance;
    cloned.isComplete = this.isComplete;
    cloned.createdAt = this.createdAt;
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      startPoint: [this.startPoint.x, this.startPoint.y, this.startPoint.z],
      endPoint: [this.endPoint.x, this.endPoint.y, this.endPoint.z],
      distance: this.distance,
      unit: this.unit,
      startShapeName: this.startShapeName,
      endShapeName: this.endShapeName,
      isComplete: this.isComplete,
      formattedDistance: this.getFormattedDistance()
    };
  }
}
