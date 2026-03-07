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

// ─── Shared Helper: Measurement Object Detection ────────────────────────────
/**
 * Check if a Three.js object (or any ancestor) is a measurement/snap-indicator.
 * Replaces duplicated parent-walk logic used in 3+ places.
 */
export function isMeasurementObject(obj: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = obj;
    while (current) {
        if (current.name === 'measurement' || current.name === 'snap-indicator') {
            return true;
        }
        current = current.parent;
    }
    return false;
}

/**
 * Recursively dispose all geometries, materials, and textures in a Three.js object.
 * Accepts an optional set of shared resources to skip (preventing double-dispose bugs).
 */
export function disposeObject(
    obj: THREE.Object3D,
    sharedResources?: Set<THREE.Material | THREE.BufferGeometry>
): void {
    obj.traverse((child: any) => {
        if (child.geometry) {
            if (!sharedResources || !sharedResources.has(child.geometry)) {
                child.geometry.dispose();
            }
        }
        if (child.material) {
            const materials: (THREE.Material & { map?: THREE.Texture })[] = Array.isArray(child.material)
                ? child.material
                : [child.material];
            for (const m of materials) {
                if (sharedResources && sharedResources.has(m)) continue;
                if (m.map) m.map.dispose();
                m.dispose();
            }
        }
    });
}

// ─── Vertex Cache ────────────────────────────────────────────────────────────
interface CachedVertexData {
    version: number;
    matrixWorldVersion: number;
    vertices: THREE.Vector3[];
}

const _vertexCache = new WeakMap<THREE.BufferGeometry, CachedVertexData>();

/**
 * Invalidate cached vertices for a specific mesh, or clear the entire cache.
 */
export function invalidateVertexCache(mesh?: THREE.Mesh): void {
    if (mesh && mesh.geometry) {
        _vertexCache.delete(mesh.geometry);
    }
}

/**
 * Extract world-space vertex positions from a mesh.
 * Results are cached per geometry version + world matrix to avoid re-computation.
 */
export function extractVertices(mesh: THREE.Mesh): THREE.Vector3[] {
    const geo = mesh.geometry;
    if (!geo) return [];

    const posAttr = geo.getAttribute('position');
    if (!posAttr) return [];

    const geoVersion = (geo as any).version ?? (posAttr as any).version ?? 0;
    // Use a simple hash of the world matrix elements to detect transform changes
    mesh.updateWorldMatrix(true, false);
    const me = mesh.matrixWorld.elements;
    const matHash = me[12] * 1000000 + me[13] * 1000 + me[14];

    const cached = _vertexCache.get(geo);
    if (cached && cached.version === geoVersion && cached.matrixWorldVersion === matHash) {
        return cached.vertices;
    }

    const vertices: THREE.Vector3[] = [];
    const seen = new Set<number>();
    const tempV = new THREE.Vector3();

    // Quantize to 3 decimal places and combine into a single integer hash
    // This avoids expensive string creation + concatenation per vertex
    const QUANT = 1000;
    const PRIME1 = 73856093;
    const PRIME2 = 19349663;
    const PRIME3 = 83492791;

    for (let i = 0; i < posAttr.count; i++) {
        tempV.fromBufferAttribute(posAttr, i);
        mesh.localToWorld(tempV);
        const hash = ((tempV.x * QUANT) | 0) * PRIME1 ^
                     ((tempV.y * QUANT) | 0) * PRIME2 ^
                     ((tempV.z * QUANT) | 0) * PRIME3;
        if (!seen.has(hash)) {
            seen.add(hash);
            vertices.push(tempV.clone());
        }
    }

    _vertexCache.set(geo, { version: geoVersion, matrixWorldVersion: matHash, vertices });
    return vertices;
}

// Reusable Vector3 for distance checks in findNearestVertex
const _snapResult = new THREE.Vector3();

/**
 * Find the nearest vertex to a given world point within a snap radius.
 * Accepts a pre-filtered array of snap-target meshes (avoids full scene traversal).
 * Uses cached vertex data and avoids per-call allocations.
 */
export function findNearestVertex(
    point: THREE.Vector3,
    targets: THREE.Mesh[],
    snapRadius: number = 0.5
): THREE.Vector3 | null {
    let found = false;
    let minDistSq = snapRadius * snapRadius;

    for (let t = 0, tLen = targets.length; t < tLen; t++) {
        const mesh = targets[t];
        if (!mesh.geometry) continue;

        const verts = extractVertices(mesh);
        for (let i = 0, len = verts.length; i < len; i++) {
            const dSq = point.distanceToSquared(verts[i]);
            if (dSq < minDistSq) {
                minDistSq = dSq;
                _snapResult.copy(verts[i]);
                found = true;
            }
        }
    }

    return found ? _snapResult.clone() : null;
}

// ─── Throttle Utility ────────────────────────────────────────────────────────
/**
 * Throttle a function to run at most once per `limitMs` milliseconds.
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, limitMs: number): T {
    let lastCall = 0;
    let pendingFrame: number | null = null;
    return ((...args: any[]) => {
        const now = performance.now();
        if (now - lastCall >= limitMs) {
            lastCall = now;
            fn(...args);
        } else if (!pendingFrame) {
            pendingFrame = requestAnimationFrame(() => {
                lastCall = performance.now();
                pendingFrame = null;
                fn(...args);
            });
        }
    }) as T;
}
