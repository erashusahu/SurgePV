import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Scene ───────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// ─── Camera ──────────────────────────────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(8, 10, 12);
camera.lookAt(0, 0, 0);

// ─── Renderer ────────────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ─── Controls ────────────────────────────────────────────────────────────────
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent going below ground
controls.minDistance = 3;
controls.maxDistance = 50;

// Right-click = orbit, Middle-click = pan, Left-click = nothing (reserved for measurement)
controls.mouseButtons = {
    LEFT: null as any,           // Disabled — left click is for measurement points
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
};

// ─── Lights ──────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 15, 10);
dirLight.castShadow = true;
scene.add(dirLight);

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362d59, 0.3);
scene.add(hemiLight);

// ─── Grid ────────────────────────────────────────────────────────────────────
const gridHelper = new THREE.GridHelper(20, 20, 0x4a4a6a, 0x2a2a4a);
scene.add(gridHelper);

// ─── Ground Plane (invisible, for raycasting) ────────────────────────────────
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x16213e,
    transparent: true,
    opacity: 0.0,
});
export const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
groundPlane.name = 'ground';
groundPlane.rotation.x = -Math.PI / 2; // make it horizontal
groundPlane.position.y = 0;
groundPlane.receiveShadow = true;
scene.add(groundPlane);

// ─── Scene objects registry ──────────────────────────────────────────────────
export const sceneObjects: THREE.Mesh[] = [];

// ─── Some 3D objects for visual context ──────────────────────────────────────
// Box
const boxGeo = new THREE.BoxGeometry(2, 2, 2);
const boxMat = new THREE.MeshStandardMaterial({
    color: 0x6c63ff,
    roughness: 0.4,
    metalness: 0.3,
});
const box = new THREE.Mesh(boxGeo, boxMat);
box.position.set(-3, 1, -2);
box.castShadow = true;
scene.add(box);
sceneObjects.push(box);

// Sphere
const sphereGeo = new THREE.SphereGeometry(1.2, 32, 32);
const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x00d2ff,
    roughness: 0.2,
    metalness: 0.5,
});
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
sphere.position.set(3, 1.2, 2);
sphere.castShadow = true;
scene.add(sphere);
sceneObjects.push(sphere);

// Cylinder
const cylGeo = new THREE.CylinderGeometry(0.8, 0.8, 3, 32);
const cylMat = new THREE.MeshStandardMaterial({
    color: 0xff6b6b,
    roughness: 0.3,
    metalness: 0.4,
});
const cyl = new THREE.Mesh(cylGeo, cylMat);
cyl.position.set(4, 1.5, -4);
cyl.castShadow = true;
scene.add(cyl);
sceneObjects.push(cyl);

// ─── Add Figure Factory ──────────────────────────────────────────────────────
const FIGURE_COLORS = [0xff6b6b, 0x6c63ff, 0x00d2ff, 0xffd600, 0x4caf50, 0xff9800, 0xe91e63, 0x9c27b0];

export type FigureType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus';

export function addFigure(type: FigureType): THREE.Mesh {
    const color = FIGURE_COLORS[Math.floor(Math.random() * FIGURE_COLORS.length)];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });

    let geo: THREE.BufferGeometry;
    let yOffset = 1;

    switch (type) {
        case 'box':
            geo = new THREE.BoxGeometry(1.5 + Math.random(), 1.5 + Math.random(), 1.5 + Math.random());
            yOffset = 1;
            break;
        case 'sphere':
            geo = new THREE.SphereGeometry(0.6 + Math.random() * 0.6, 24, 24);
            yOffset = 0.8 + Math.random() * 0.4;
            break;
        case 'cylinder': {
            const r = 0.4 + Math.random() * 0.5;
            const h = 1.5 + Math.random() * 1.5;
            geo = new THREE.CylinderGeometry(r, r, h, 24);
            yOffset = h / 2;
            break;
        }
        case 'cone': {
            const cr = 0.5 + Math.random() * 0.5;
            const ch = 1.5 + Math.random() * 1.5;
            geo = new THREE.ConeGeometry(cr, ch, 24);
            yOffset = ch / 2;
            break;
        }
        case 'torus':
            geo = new THREE.TorusGeometry(0.6 + Math.random() * 0.3, 0.2 + Math.random() * 0.15, 16, 32);
            yOffset = 0.8;
            break;
        default:
            geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    }

    const mesh = new THREE.Mesh(geo, mat);

    // ── Smart spacing: place away from existing shapes ──────────────────
    const pos = findSpacedPosition(3.0); // minimum 3 units apart
    mesh.position.set(pos.x, yOffset, pos.z);

    mesh.castShadow = true;
    scene.add(mesh);
    sceneObjects.push(mesh);
    return mesh;
}

/**
 * Find a position on the XZ plane that is at least `minDist` away from all existing shapes.
 * Tries up to 30 random positions, picks the one with the best distance.
 */
function findSpacedPosition(minDist: number): { x: number; z: number } {
    const spread = 9; // placement radius
    let bestPos = { x: 0, z: 0 };
    let bestMinDist = -1;

    for (let attempt = 0; attempt < 30; attempt++) {
        const x = (Math.random() - 0.5) * spread * 2;
        const z = (Math.random() - 0.5) * spread * 2;

        // Find the minimum distance to any existing shape
        let closestDist = Infinity;
        for (const obj of sceneObjects) {
            const dx = obj.position.x - x;
            const dz = obj.position.z - z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < closestDist) closestDist = d;
        }

        // If this position is far enough, use it immediately
        if (closestDist >= minDist) {
            return { x, z };
        }

        // Otherwise track the best we've found
        if (closestDist > bestMinDist) {
            bestMinDist = closestDist;
            bestPos = { x, z };
        }
    }

    return bestPos;
}

// ─── Remove Figure ───────────────────────────────────────────────────────────
export function removeFigure(mesh: THREE.Mesh): void {
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m: THREE.Material) => m.dispose());
        } else {
            (mesh.material as THREE.Material).dispose();
        }
    }
    const idx = sceneObjects.indexOf(mesh);
    if (idx !== -1) sceneObjects.splice(idx, 1);
}

// ─── Resize Handler ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Animation Loop ─────────────────────────────────────────────────────────
export function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
