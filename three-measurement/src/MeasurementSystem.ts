import * as THREE from 'three';
import { calculateDistance, formatDistance, generateId, disposeObject, findNearestVertex, nextUnit } from './utils';
import type { Unit } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface MeasurementData {
    id: string;
    startPoint: THREE.Vector3;
    endPoint: THREE.Vector3;
    distance: number;
    unit: Unit;
    lineGroup: THREE.Group;
    startShape: string;
    endShape: string;
}

export interface MeasurementRecord {
    id: string;
    index: number;
    startShape: string;
    endShape: string;
    distance: number;
    formattedDistance: string;
    unit: Unit;
}

// ─── Measurement System ──────────────────────────────────────────────────────
export class MeasurementSystem {
    private scene: THREE.Scene;
    private snapTargets: THREE.Mesh[];
    private isActive: boolean = false;
    private isMeasuring: boolean = false;
    private startPoint: THREE.Vector3 | null = null;
    private previewLine: THREE.Line | null = null;
    private previewLabel: THREE.Sprite | null = null;
    private previewLabelCanvas: HTMLCanvasElement | null = null;
    private previewLabelTexture: THREE.CanvasTexture | null = null;
    private startMarker: THREE.Mesh | null = null;
    private cursorMarker: THREE.Mesh | null = null;
    private measurements: Map<string, MeasurementData> = new Map();

    // Snapping
    private snapIndicator: THREE.Mesh | null = null;
    private snappedPoint: THREE.Vector3 | null = null;
    private snapRadius: number = 0.6;

    // Selection
    private selectedId: string | null = null;
    private selectedHighlightMaterial!: THREE.LineBasicMaterial;

    // Unit
    private currentUnit: Unit = 'm';

    // Reusable materials (memory-efficient)
    private dimensionLineMaterial!: THREE.LineBasicMaterial;
    private previewLineMaterial!: THREE.LineDashedMaterial;
    private arrowMaterial!: THREE.MeshBasicMaterial;
    private markerMaterial!: THREE.MeshBasicMaterial;
    private cursorMaterial!: THREE.MeshBasicMaterial;
    private extensionLineMaterial!: THREE.LineBasicMaterial;
    private snapMaterial!: THREE.MeshBasicMaterial;

    // Shared geometries
    private markerGeometry!: THREE.SphereGeometry;
    private snapGeometry!: THREE.SphereGeometry;
    private arrowGeometry!: THREE.ConeGeometry;

    // Set of shared resources that must NOT be disposed when removing individual measurements
    private sharedResources!: Set<THREE.Material | THREE.BufferGeometry>;

    // Reusable temp objects to avoid per-call allocations
    private static _tempVec = new THREE.Vector3();
    private static _tempVec2 = new THREE.Vector3();
    private static _tempQuat = new THREE.Quaternion();
    private static _upVec = new THREE.Vector3(0, 1, 0);

    // Callback for status updates
    public onStatusChange: (() => void) | null = null;

    constructor(scene: THREE.Scene, snapTargets: THREE.Mesh[]) {
        this.scene = scene;
        this.snapTargets = snapTargets;
        this.initMaterials();
    }

    // ─── Initialize Reusable Materials ───────────────────────────────────────
    private initMaterials(): void {
        this.dimensionLineMaterial = new THREE.LineBasicMaterial({
            color: 0x00e5ff,
            linewidth: 2,
        });

        this.previewLineMaterial = new THREE.LineDashedMaterial({
            color: 0x94a3b8,
            dashSize: 0.15,
            gapSize: 0.1,
            linewidth: 1,
        });

        this.arrowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            side: THREE.DoubleSide,
        });

        this.markerMaterial = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
        });

        this.cursorMaterial = new THREE.MeshBasicMaterial({
            color: 0xffd600,
            transparent: true,
            opacity: 0.7,
        });

        this.extensionLineMaterial = new THREE.LineBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.5,
        });

        this.snapMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.9,
        });

        this.selectedHighlightMaterial = new THREE.LineBasicMaterial({
            color: 0xffd600,
            linewidth: 3,
        });

        this.markerGeometry = new THREE.SphereGeometry(0.12, 12, 12);
        this.snapGeometry = new THREE.SphereGeometry(0.18, 12, 12);
        this.arrowGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);

        this.sharedResources = new Set([
            this.dimensionLineMaterial,
            this.previewLineMaterial,
            this.arrowMaterial,
            this.markerMaterial,
            this.cursorMaterial,
            this.extensionLineMaterial,
            this.snapMaterial,
            this.selectedHighlightMaterial,
            this.markerGeometry,
            this.snapGeometry,
            this.arrowGeometry,
        ]);
    }

    // ─── Activate / Deactivate ───────────────────────────────────────────────
    activate(): void {
        this.isActive = true;
        this.isMeasuring = false;
        this.startPoint = null;
        this.deselectMeasurement();
        this.showCursorMarker();
        this.showSnapIndicator();
    }

    deactivate(): void {
        this.cancelMeasurement();
        this.isActive = false;
        this.hideCursorMarker();
        this.hideSnapIndicator();
    }

    get active(): boolean {
        return this.isActive;
    }

    get measuring(): boolean {
        return this.isMeasuring;
    }

    get measurementCount(): number {
        return this.measurements.size;
    }

    get unit(): Unit {
        return this.currentUnit;
    }

    get hasSelection(): boolean {
        return this.selectedId !== null;
    }

    get selectedMeasurementId(): string | null {
        return this.selectedId;
    }

    // ─── Table Data ──────────────────────────────────────────────────────────
    getMeasurementRecords(): MeasurementRecord[] {
        const records: MeasurementRecord[] = [];
        let idx = 1;
        for (const m of this.measurements.values()) {
            records.push({
                id: m.id,
                index: idx++,
                startShape: m.startShape,
                endShape: m.endShape,
                distance: m.distance,
                formattedDistance: formatDistance(m.distance, m.unit),
                unit: m.unit,
            });
        }
        return records;
    }

    private detectShapeName(point: THREE.Vector3): string {
        let closest = 'Ground';
        let minDistSq = Infinity;
        for (const mesh of this.snapTargets) {
            const dSq = point.distanceToSquared(mesh.position);
            if (dSq < minDistSq) {
                minDistSq = dSq;
                closest = this.geometryTypeName(mesh);
            }
        }
        // Only assign shape if reasonably close (within 5 units)
        return minDistSq < 25 ? closest : 'Ground';
    }

    private geometryTypeName(mesh: THREE.Mesh): string {
        const geo = mesh.geometry;
        if (!geo) return 'Shape';
        const type = geo.type;
        if (type.includes('Box')) return 'Box';
        if (type.includes('Sphere')) return 'Sphere';
        if (type.includes('Cylinder')) return 'Cylinder';
        if (type.includes('Cone')) return 'Cone';
        if (type.includes('Torus')) return 'Torus';
        return 'Shape';
    }

    // ─── Snap Indicator ─────────────────────────────────────────────────────
    private showSnapIndicator(): void {
        if (!this.snapIndicator) {
            this.snapIndicator = new THREE.Mesh(this.snapGeometry, this.snapMaterial);
            this.snapIndicator.name = 'snap-indicator';
            this.snapIndicator.visible = false;
            this.scene.add(this.snapIndicator);
        }
    }

    private hideSnapIndicator(): void {
        if (this.snapIndicator) {
            this.scene.remove(this.snapIndicator);
            this.snapIndicator = null;
        }
        this.snappedPoint = null;
    }

    // ─── Cursor Marker ──────────────────────────────────────────────────────
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

    // ─── Event Handling ──────────────────────────────────────────────────────
    handleClick(worldPosition: THREE.Vector3): void {
        if (!this.isActive) return;

        // Use snapped position if available
        const pos = this.snappedPoint ? this.snappedPoint.clone() : worldPosition.clone();

        if (!this.isMeasuring) {
            // ── First click: start measuring ─────────────────────────────────
            this.startPoint = pos;
            this.isMeasuring = true;

            // Start marker dot
            this.startMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
            this.startMarker.position.copy(this.startPoint);
            this.scene.add(this.startMarker);

            // Preview dashed line — pre-allocate buffer for 2 points
            const positions = new Float32Array(6);
            positions[0] = this.startPoint.x;
            positions[1] = this.startPoint.y;
            positions[2] = this.startPoint.z;
            positions[3] = this.startPoint.x;
            positions[4] = this.startPoint.y;
            positions[5] = this.startPoint.z;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this.previewLine = new THREE.Line(geometry, this.previewLineMaterial);
            this.previewLine.computeLineDistances();
            this.scene.add(this.previewLine);
        } else {
            // ── Second click: finalize ───────────────────────────────────────
            this.completeMeasurement(pos);
        }
    }

    handleMouseMove(worldPosition: THREE.Vector3): void {
        if (!this.isActive) return;

        // ── Vertex Snapping ──────────────────────────────────────────────────
        const snapped = findNearestVertex(worldPosition, this.snapTargets, this.snapRadius);

        if (snapped) {
            this.snappedPoint = snapped;
            if (this.snapIndicator) {
                this.snapIndicator.position.copy(snapped);
                this.snapIndicator.visible = true;
            }
            if (this.cursorMarker) {
                this.cursorMarker.position.copy(snapped);
                this.cursorMarker.visible = true;
            }
        } else {
            this.snappedPoint = null;
            if (this.snapIndicator) {
                this.snapIndicator.visible = false;
            }
            if (this.cursorMarker) {
                this.cursorMarker.position.copy(worldPosition);
                this.cursorMarker.visible = true;
            }
        }

        // Use snapped or raw position for preview
        const effectivePos = snapped || worldPosition;

        // Update preview line endpoint + live distance label
        if (this.isMeasuring && this.previewLine && this.startPoint) {
            const posAttr = this.previewLine.geometry.getAttribute('position') as THREE.BufferAttribute;
            const arr = posAttr.array as Float32Array;
            arr[3] = effectivePos.x;
            arr[4] = effectivePos.y;
            arr[5] = effectivePos.z;
            posAttr.needsUpdate = true;
            this.previewLine.geometry.computeBoundingSphere();
            this.previewLine.computeLineDistances();

            // Live distance preview label
            const dist = calculateDistance(this.startPoint, effectivePos);
            this.updatePreviewLabel(dist, this.startPoint, effectivePos);
        }
    }

    cancelMeasurement(): void {
        if (this.previewLine) {
            this.scene.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine = null;
        }
        if (this.previewLabel) {
            this.scene.remove(this.previewLabel);
            this.previewLabel = null;
        }
        if (this.startMarker) {
            this.scene.remove(this.startMarker);
            this.startMarker = null;
        }
        this.startPoint = null;
        this.isMeasuring = false;
    }

    // ─── Live Preview Label ──────────────────────────────────────────────────
    private updatePreviewLabel(distance: number, start: THREE.Vector3, end: THREE.Vector3): void {
        const text = formatDistance(distance, this.currentUnit);

        // Lazy-init reusable canvas + texture + sprite
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
                depthTest: false,
            });
            this.previewLabel = new THREE.Sprite(mat);
            this.previewLabel.scale.set(2.5, 0.625, 1);
            this.scene.add(this.previewLabel);
        }

        // Repaint canvas
        const canvas = this.previewLabelCanvas;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
        ctx.beginPath();
        ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 10);
        ctx.fill();

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        this.previewLabelTexture.needsUpdate = true;

        // Position at midpoint, offset above line
        const mid = MeasurementSystem._tempVec;
        mid.copy(start).lerp(end, 0.5);
        mid.y += 0.5;
        this.previewLabel.position.copy(mid);
    }

    // ─── Selection ──────────────────────────────────────────────────────────
    selectMeasurementAt(raycaster: THREE.Raycaster): boolean {
        // Try to raycast against all measurement groups
        for (const [id, m] of this.measurements) {
            const intersects = raycaster.intersectObject(m.lineGroup, true);
            if (intersects.length > 0) {
                this.selectMeasurement(id);
                return true;
            }
        }
        this.deselectMeasurement();
        return false;
    }

    selectMeasurement(id: string): void {
        this.deselectMeasurement();
        const m = this.measurements.get(id);
        if (!m) return;

        this.selectedId = id;

        // Highlight: change line color to yellow
        m.lineGroup.traverse((child: any) => {
            if (child instanceof THREE.Line && child.material === this.dimensionLineMaterial) {
                child.material = this.selectedHighlightMaterial;
            }
        });
    }

    deselectMeasurement(): void {
        if (this.selectedId) {
            const m = this.measurements.get(this.selectedId);
            if (m) {
                // Restore original material
                m.lineGroup.traverse((child: any) => {
                    if (child instanceof THREE.Line && child.material === this.selectedHighlightMaterial) {
                        child.material = this.dimensionLineMaterial;
                    }
                });
            }
            this.selectedId = null;
        }
    }

    // ─── Keyboard Actions on Selection ──────────────────────────────────────
    eraseSelected(): boolean {
        if (!this.selectedId) return false;
        this.removeMeasurement(this.selectedId);
        this.selectedId = null;
        return true;
    }

    changeUnitSelected(): boolean {
        if (!this.selectedId) return false;
        const m = this.measurements.get(this.selectedId);
        if (!m) return false;

        m.unit = nextUnit(m.unit);

        // Rebuild the label
        this.rebuildMeasurementLabel(m);
        return true;
    }

    cycleGlobalUnit(): void {
        this.currentUnit = nextUnit(this.currentUnit);

        // Update all measurements
        for (const m of this.measurements.values()) {
            m.unit = this.currentUnit;
            this.rebuildMeasurementLabel(m);
        }
    }

    private rebuildMeasurementLabel(m: MeasurementData): void {
        // Find and remove old sprite
        const oldSprites: THREE.Sprite[] = [];
        m.lineGroup.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Sprite) {
                oldSprites.push(child);
            }
        });
        for (const s of oldSprites) {
            m.lineGroup.remove(s);
            if ((s.material as THREE.SpriteMaterial).map) {
                (s.material as THREE.SpriteMaterial).map!.dispose();
            }
            s.material.dispose();
        }

        // Create new label
        const midpoint = m.startPoint.clone().lerp(m.endPoint, 0.5);
        midpoint.y += 0.7;
        const label = this.createTextSprite(
            formatDistance(m.distance, m.unit),
            midpoint
        );
        m.lineGroup.add(label);
    }

    // ─── Finalize Measurement ────────────────────────────────────────────────
    private completeMeasurement(endPoint: THREE.Vector3): void {
        const start = this.startPoint!;
        const end = endPoint.clone();

        const distance = calculateDistance(start, end);
        const id = generateId();
        const group = this.createDimensionGroup(start, end, distance, this.currentUnit);
        this.scene.add(group);

        this.measurements.set(id, {
            id,
            startPoint: start,
            endPoint: end,
            distance,
            unit: this.currentUnit,
            lineGroup: group,
            startShape: this.detectShapeName(start),
            endShape: this.detectShapeName(end),
        });

        // Clean up preview state
        this.cancelMeasurement();
    }

    // ─── Create Dimension Line Group ─────────────────────────────────────────
    private createDimensionGroup(
        start: THREE.Vector3,
        end: THREE.Vector3,
        distance: number,
        unit: Unit
    ): THREE.Group {
        const group = new THREE.Group();
        group.name = 'measurement';

        const direction = end.clone().sub(start).normalize();

        // 1. Main dimension line
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(lineGeometry, this.dimensionLineMaterial);
        group.add(line);

        // 2. Endpoint markers (dots)
        const startDot = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
        startDot.position.copy(start);
        group.add(startDot);

        const endDot = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
        endDot.position.copy(end);
        group.add(endDot);

        // 3. Arrowheads (cones)
        const arrowStart = this.createArrowHead(start, direction);
        const arrowEnd = this.createArrowHead(end, direction.clone().negate());
        group.add(arrowStart);
        group.add(arrowEnd);

        // 4. Extension lines (short perpendicular ticks at endpoints)
        const extLines = this.createExtensionLines(start, end);
        extLines.forEach((ext) => group.add(ext));

        // 5. Distance text label
        const midpoint = start.clone().lerp(end, 0.5);
        midpoint.y += 0.7; // Offset above the line for visibility
        const label = this.createTextSprite(formatDistance(distance, unit), midpoint);
        group.add(label);

        return group;
    }

    // ─── Arrowhead ───────────────────────────────────────────────────────────
    private createArrowHead(position: THREE.Vector3, direction: THREE.Vector3): THREE.Mesh {
        const cone = new THREE.Mesh(this.arrowGeometry, this.arrowMaterial);
        cone.position.copy(position);

        // Orient cone — reuse static temp objects
        MeasurementSystem._tempQuat.setFromUnitVectors(MeasurementSystem._upVec, direction);
        cone.quaternion.copy(MeasurementSystem._tempQuat);

        return cone;
    }

    // ─── Extension Lines ─────────────────────────────────────────────────────
    private createExtensionLines(start: THREE.Vector3, end: THREE.Vector3): THREE.Line[] {
        const tv = MeasurementSystem._tempVec;
        const tv2 = MeasurementSystem._tempVec2;

        const dir = tv.copy(end).sub(start).normalize();

        // Perpendicular direction (cross with Y-up)
        const perp = tv2.crossVectors(dir, MeasurementSystem._upVec).normalize();
        if (perp.lengthSq() < 0.001) {
            perp.set(1, 0, 0);
        }

        const tickLength = 0.3;
        const lines: THREE.Line[] = [];

        // Helper: build a tick line at a given point
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

    // ─── Text Label (Canvas → Sprite) ────────────────────────────────────────
    private createTextSprite(text: string, position: THREE.Vector3): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        canvas.width = 512;
        canvas.height = 128;

        // Shadow / glow effect
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 10;

        // Background with rounded rect
        ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
        const pad = 6;
        ctx.beginPath();
        ctx.roundRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, 14);
        ctx.fill();

        // Bright border
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Distance text — BOLD, WHITE
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 6;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
        });

        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.scale.set(4.0, 1.0, 1);

        return sprite;
    }

    // ─── Clear All Measurements ──────────────────────────────────────────────
    clearAll(): void {
        this.cancelMeasurement();
        this.deselectMeasurement();
        this.measurements.forEach((m) => {
            this.scene.remove(m.lineGroup);
            disposeObject(m.lineGroup, this.sharedResources);
        });
        this.measurements.clear();
    }

    // ─── Remove Single Measurement ───────────────────────────────────────────
    removeMeasurement(id: string): void {
        const m = this.measurements.get(id);
        if (m) {
            this.scene.remove(m.lineGroup);
            disposeObject(m.lineGroup, this.sharedResources);
            this.measurements.delete(id);
        }
    }

    // ─── Full Dispose ────────────────────────────────────────────────────────
    dispose(): void {
        this.clearAll();
        this.hideCursorMarker();
        this.hideSnapIndicator();

        // Dispose reusable materials
        this.dimensionLineMaterial.dispose();
        this.previewLineMaterial.dispose();
        this.arrowMaterial.dispose();
        this.markerMaterial.dispose();
        this.cursorMaterial.dispose();
        this.extensionLineMaterial.dispose();
        this.snapMaterial.dispose();
        this.selectedHighlightMaterial.dispose();
        this.markerGeometry.dispose();
        this.snapGeometry.dispose();
        this.arrowGeometry.dispose();
    }
}
