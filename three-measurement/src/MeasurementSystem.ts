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
}

// ─── Measurement System ──────────────────────────────────────────────────────
export class MeasurementSystem {
    private scene: THREE.Scene;
    private isActive: boolean = false;
    private isMeasuring: boolean = false;
    private startPoint: THREE.Vector3 | null = null;
    private previewLine: THREE.Line | null = null;
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

    // Callback for status updates
    public onStatusChange: (() => void) | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
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
        const snapped = findNearestVertex(worldPosition, this.scene, this.snapRadius);

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

        // Update preview line endpoint — reuse existing buffer to avoid allocation
        if (this.isMeasuring && this.previewLine && this.startPoint) {
            const posAttr = this.previewLine.geometry.getAttribute('position') as THREE.BufferAttribute;
            const arr = posAttr.array as Float32Array;
            arr[3] = effectivePos.x;
            arr[4] = effectivePos.y;
            arr[5] = effectivePos.z;
            posAttr.needsUpdate = true;
            this.previewLine.geometry.computeBoundingSphere();
            this.previewLine.computeLineDistances();
        }
    }

    cancelMeasurement(): void {
        if (this.previewLine) {
            this.scene.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine = null;
        }
        if (this.startMarker) {
            this.scene.remove(this.startMarker);
            this.startMarker = null;
        }
        this.startPoint = null;
        this.isMeasuring = false;
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

        // Orient cone to point in the measurement direction
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        cone.quaternion.copy(quaternion);

        return cone;
    }

    // ─── Extension Lines ─────────────────────────────────────────────────────
    private createExtensionLines(start: THREE.Vector3, end: THREE.Vector3): THREE.Line[] {
        const lines: THREE.Line[] = [];
        const dir = end.clone().sub(start).normalize();

        // Perpendicular direction (cross with Y-up)
        let perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        if (perp.lengthSq() < 0.001) {
            perp = new THREE.Vector3(1, 0, 0);
        }

        const tickLength = 0.3;

        // Start tick
        const s1 = start.clone().add(perp.clone().multiplyScalar(tickLength));
        const s2 = start.clone().add(perp.clone().multiplyScalar(-tickLength));
        const startTickGeo = new THREE.BufferGeometry().setFromPoints([s1, s2]);
        lines.push(new THREE.Line(startTickGeo, this.extensionLineMaterial));

        // End tick
        const e1 = end.clone().add(perp.clone().multiplyScalar(tickLength));
        const e2 = end.clone().add(perp.clone().multiplyScalar(-tickLength));
        const endTickGeo = new THREE.BufferGeometry().setFromPoints([e1, e2]);
        lines.push(new THREE.Line(endTickGeo, this.extensionLineMaterial));

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
        const radius = 14;
        const pad = 6;
        ctx.beginPath();
        ctx.moveTo(pad + radius, pad);
        ctx.lineTo(canvas.width - pad - radius, pad);
        ctx.quadraticCurveTo(canvas.width - pad, pad, canvas.width - pad, pad + radius);
        ctx.lineTo(canvas.width - pad, canvas.height - pad - radius);
        ctx.quadraticCurveTo(canvas.width - pad, canvas.height - pad, canvas.width - pad - radius, canvas.height - pad);
        ctx.lineTo(pad + radius, canvas.height - pad);
        ctx.quadraticCurveTo(pad, canvas.height - pad, pad, canvas.height - pad - radius);
        ctx.lineTo(pad, pad + radius);
        ctx.quadraticCurveTo(pad, pad, pad + radius, pad);
        ctx.closePath();
        ctx.fill();

        // Bright border
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 5;
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
