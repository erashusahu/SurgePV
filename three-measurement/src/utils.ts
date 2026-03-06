import * as THREE from 'three';

// ─── Units ───────────────────────────────────────────────────────────────────
export type Unit = 'm' | 'cm' | 'ft' | 'in';

const UNIT_LABELS: Record<Unit, string> = {
    m: 'm',
    cm: 'cm',
    ft: 'ft',
    in: 'in',
};

const UNIT_FACTORS: Record<Unit, number> = {
    m: 1,
    cm: 100,
    ft: 3.28084,
    in: 39.3701,
};

const UNIT_ORDER: Unit[] = ['m', 'cm', 'ft', 'in'];

export function nextUnit(current: Unit): Unit {
    const idx = UNIT_ORDER.indexOf(current);
    return UNIT_ORDER[(idx + 1) % UNIT_ORDER.length];
}

/**
 * Calculate the Euclidean distance between two 3D points.
 */
export function calculateDistance(p1: THREE.Vector3, p2: THREE.Vector3): number {
    return p1.distanceTo(p2);
}

/**
 * Format a distance value to a human-readable string with a given unit.
 */
export function formatDistance(d: number, unit: Unit = 'm'): string {
    const converted = d * UNIT_FACTORS[unit];
    return `${converted.toFixed(2)} ${UNIT_LABELS[unit]}`;
}

/**
 * Generate a unique identifier for a measurement.
 */
let _idCounter = 0;
export function generateId(): string {
    return `measurement_${Date.now()}_${++_idCounter}`;
}

/**
 * Recursively dispose all geometries, materials, and textures in a Three.js object.
 * This is critical for preventing GPU memory leaks.
 */
export function disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child: any) => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m: THREE.Material & { map?: THREE.Texture }) => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            } else {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        }
    });
}

/**
 * Extract world-space vertex positions from a mesh.
 * Used for vertex snapping.
 */
export function extractVertices(mesh: THREE.Mesh): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    const geo = mesh.geometry;
    if (!geo) return vertices;

    const posAttr = geo.getAttribute('position');
    if (!posAttr) return vertices;

    const seen = new Set<string>();

    for (let i = 0; i < posAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        // Transform local vertex to world space
        mesh.localToWorld(v);
        // Deduplicate (round to 3 decimals)
        const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
        if (!seen.has(key)) {
            seen.add(key);
            vertices.push(v);
        }
    }

    return vertices;
}

/**
 * Find the nearest vertex to a given world point within a snap radius.
 * Returns the snapped vertex or null if none is within range.
 */
export function findNearestVertex(
    point: THREE.Vector3,
    scene: THREE.Scene,
    snapRadius: number = 0.5
): THREE.Vector3 | null {
    let nearest: THREE.Vector3 | null = null;
    let minDist = snapRadius;

    scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh && obj.geometry && obj.name !== 'ground') {
            // Skip measurement-related objects
            let parent: THREE.Object3D | null = obj;
            let isMeasurement = false;
            while (parent) {
                if (parent.name === 'measurement' || parent.name === 'snap-indicator') {
                    isMeasurement = true;
                    break;
                }
                parent = parent.parent;
            }
            if (isMeasurement) return;

            const verts = extractVertices(obj);
            for (const v of verts) {
                const d = point.distanceTo(v);
                if (d < minDist) {
                    minDist = d;
                    nearest = v.clone();
                }
            }
        }
    });

    return nearest;
}
