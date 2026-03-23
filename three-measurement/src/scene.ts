import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { World } from './ecs/World';
import { Transform } from './components/Transform';
import { Renderable } from './components/Renderable';
import { Interactive } from './components/Interactive';
import { Snappable } from './components/Snappable';
import { Shape } from './components/Shape';
import type { ShapeType } from './components/Shape';

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
renderer.shadowMap.type = THREE.PCFShadowMap;

// ─── Controls ────────────────────────────────────────────────────────────────
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 3;
controls.maxDistance = 50;

controls.mouseButtons = {
  LEFT: null as unknown as THREE.MOUSE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};

// ─── Lights ──────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
console.log('✓ Ambient light added (0.6 intensity)');

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 15, 10);
dirLight.castShadow = true;
scene.add(dirLight);
console.log('✓ Directional light added (0.8 intensity)');

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362d59, 0.3);
scene.add(hemiLight);
console.log('✓ Hemisphere light added');

// ─── Grid ────────────────────────────────────────────────────────────────────
const gridHelper = new THREE.GridHelper(20, 20, 0x4a4a6a, 0x2a2a4a);
gridHelper.position.y = 0.01; // Slight offset above ground to prevent z-fighting
scene.add(gridHelper);
console.log('✓ Grid helper added (20x20 units)');

// ─── Ground Plane (for raycasting) ───────────────────────────────────────────
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshBasicMaterial({
  color: 0x16213e,
  transparent: true,
  opacity: 0.0,
});
export const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
groundPlane.name = 'ground';
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = 0;
groundPlane.receiveShadow = true;
scene.add(groundPlane);

// ─── Resize Handler ──────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Create Initial Shape Entity ─────────────────────────────────────────────
export function createShapeEntity(
  world: World,
  id: string,
  mesh: THREE.Mesh,
  shapeType: ShapeType
): void {
  const entity = world.createEntity(id);

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

  const color = (mesh.material as THREE.MeshStandardMaterial).color?.getHex() ?? 0xffffff;
  entity.addComponent(new Shape({
    shapeType,
    color,
    removable: true
  }));

  entity.addTag('shape');

  // Notify world so systems can inject this entity
  world.entityChanged(entity);
}

// ─── Initialize Default Shapes ───────────────────────────────────────────────
export function initializeDefaultShapes(world: World): void {
  console.log('🎨 Initializing default shapes...');
  
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
  console.log('✓ Box added to scene at', box.position);
  createShapeEntity(world, 'shape_box_1', box, 'box');

  // Sphere
  const sphereGeo = new THREE.SphereGeometry(1.2, 20, 20);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x00d2ff,
    roughness: 0.2,
    metalness: 0.5,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.set(3, 1.2, 2);
  sphere.castShadow = true;
  scene.add(sphere);
  console.log('✓ Sphere added to scene at', sphere.position);
  createShapeEntity(world, 'shape_sphere_1', sphere, 'sphere');

  // Cylinder
  const cylGeo = new THREE.CylinderGeometry(0.8, 0.8, 3, 20);
  const cylMat = new THREE.MeshStandardMaterial({
    color: 0xff6b6b,
    roughness: 0.3,
    metalness: 0.4,
  });
  const cyl = new THREE.Mesh(cylGeo, cylMat);
  cyl.position.set(4, 1.5, -4);
  cyl.castShadow = true;
  scene.add(cyl);
  console.log('✓ Cylinder added to scene at', cyl.position);
  createShapeEntity(world, 'shape_cylinder_1', cyl, 'cylinder');
  
  console.log('📊 Scene now has', scene.children.length, 'total objects');
}
