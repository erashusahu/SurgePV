# Three.js 3D Measurement Tool - ECS Architecture

A professional 3D measurement tool built with **Three.js** and **Entity Component System (ECS)** architecture. Measure distances between any points in 3D space with precision snapping, multiple unit support, and an intuitive user interface.

![Three.js Measurement Tool](https://img.shields.io/badge/Three.js-r150+-black?logo=three.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5.0+-purple?logo=vite)

## Features

- **3D Measurement** - Click any two points to measure distance in 3D space
- **Vertex Snapping** - Automatically snap to shape vertices for precise measurements
- **Multiple Units** - Support for Meters (m), Centimeters (cm), Feet (ft), Inches (in)
- **Shape Management** - Add, remove, move, and undo shapes (box, sphere, cylinder, cone, torus)
- **Selection System** - Click measurements to select, edit, or delete them
- **Records Table** - View all measurements in a sortable table
- **Drag & Drop** - Move shapes freely on the ground plane
- **Undo Support** - Undo shape deletions with Ctrl+Z
- **ECS Architecture** - Clean, maintainable, and scalable codebase

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Architecture Overview](#architecture-overview)
- [Directory Structure](#directory-structure)
- [ECS Core](#ecs-core)
- [Components](#components)
- [Systems](#systems)
- [Event Bus](#event-bus)
- [Usage Guide](#usage-guide)
- [Adding New Features](#adding-new-features)
- [Best Practices](#best-practices)
- [Debugging](#debugging)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Open http://localhost:5173 in your browser.

---

## How It Works

### Step-by-Step Measurement Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. USER CLICKS "MEASURE" BUTTON                                    │
│     └──► InputSystem emits 'mode:toggle' { mode: 'measuring' }      │
│          └──► MeasuringSystem activates, shows cursor marker        │
├─────────────────────────────────────────────────────────────────────┤
│  2. USER MOVES MOUSE OVER SCENE                                     │
│     └──► InputSystem raycasts to find intersection point            │
│          └──► SnappingSystem finds nearest vertex (if close enough) │
│               └──► Snap indicator appears at vertex                 │
├─────────────────────────────────────────────────────────────────────┤
│  3. USER CLICKS FIRST POINT                                         │
│     └──► MeasuringSystem stores startPoint                          │
│          └──► Start marker (cyan sphere) appears                    │
│               └──► Preview line begins following cursor             │
├─────────────────────────────────────────────────────────────────────┤
│  4. USER CLICKS SECOND POINT                                        │
│     └──► MeasuringSystem calculates distance                        │
│          └──► Creates Measurement entity with components:           │
│               • Transform, Measurement, Dimension, Renderable       │
│          └──► Dimension visuals added to scene (line, arrows, label)│
│          └──► Emits 'measure:completed' event                       │
│               └──► UISystem updates records table                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Application Modes

| Mode | Description | Cursor | Actions |
|------|-------------|--------|---------|
| **Idle** | Default state | `default` | Click measurements to select |
| **Measuring** | Creating measurements | `crosshair` | Click to place points |
| **Removing** | Deleting shapes | `not-allowed` | Click shape to delete |
| **Moving** | Dragging shapes | `grab` | Drag shapes on ground plane |

### Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────►│  InputSystem │────►│   EventBus   │
│   Input      │     │  (Priority 5)│     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌────────────────────────────┼────────────────────────────┐
                     │                            │                            │
                     ▼                            ▼                            ▼
            ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
            │SnappingSystem│            │MeasuringSystem│           │  ShapeSystem │
            │ (Priority 10)│            │ (Priority 30) │           │ (Priority 20)│
            └──────────────┘            └──────────────┘            └──────────────┘
                     │                            │                            │
                     └────────────────────────────┼────────────────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────┐
                                         │   UISystem   │────► DOM Updates
                                         │(Priority 100)│
                                         └──────────────┘
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         WORLD                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    EVENT BUS                             ││
│  │  (Decoupled pub/sub communication between systems)       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ ENTITY 1 │  │ ENTITY 2 │  │ ENTITY 3 │  │ ENTITY N │    │
│  │┌────────┐│  │┌────────┐│  │┌────────┐│  │┌────────┐│    │
│  ││Transform││  ││Transform││  ││Measure-││  ││  ...   ││    │
│  │└────────┘│  │└────────┘│  ││  ment  ││  │└────────┘│    │
│  │┌────────┐│  │┌────────┐│  │└────────┘│  │          │    │
│  ││Render- ││  ││ Shape  ││  │┌────────┐│  │          │    │
│  ││ able   ││  │└────────┘│  ││Dimension│  │          │    │
│  │└────────┘│  │┌────────┐│  │└────────┘│  │          │    │
│  │┌────────┐│  ││Snappable│  │          │  │          │    │
│  ││ Shape  ││  │└────────┘│  │          │  │          │    │
│  │└────────┘│  │          │  │          │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      SYSTEMS                             ││
│  │  TransformSystem → SnappingSystem → MeasuringSystem →   ││
│  │  SelectionSystem → DragSystem → UISystem                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Entity** | A unique ID with a collection of components (e.g., a shape, a measurement) |
| **Component** | Pure data container with no logic (e.g., Transform, Renderable, Measurement) |
| **System** | Logic that operates on entities with specific components (e.g., MeasuringSystem) |
| **World** | Container that manages entities and runs systems in order |
| **EventBus** | Pub/sub system for decoupled communication between systems |

---

## Directory Structure

```
src/
├── ecs/                          # ECS Core
│   ├── Component.ts              # Base component class
│   ├── Entity.ts                 # Entity container
│   ├── System.ts                 # Base system class
│   ├── World.ts                  # ECS world manager
│   ├── EventBus.ts               # Event pub/sub system
│   └── index.ts                  # Exports
│
├── components/                   # Data Components
│   ├── Transform.ts              # Position, rotation, scale
│   ├── Renderable.ts             # Three.js mesh reference
│   ├── Measurement.ts            # Measurement data (points, distance, unit)
│   ├── Interactive.ts            # Selection, hover, drag states
│   ├── Snappable.ts              # Vertex snapping data
│   ├── Dimension.ts              # Visual dimension line elements
│   ├── Shape.ts                  # Shape metadata (type, color)
│   └── index.ts                  # Exports
│
├── systems/                      # Logic Systems
│   ├── TransformSystem.ts        # Syncs Transform → mesh
│   ├── InputSystem.ts            # Mouse/keyboard input handling
│   ├── SnappingSystem.ts         # Vertex snap detection
│   ├── ShapeSystem.ts            # Shape creation/removal/undo
│   ├── MeasuringSystem.ts        # Measurement creation/management
│   ├── SelectionSystem.ts        # Entity selection highlighting
│   ├── DragSystem.ts             # Shape dragging
│   ├── UISystem.ts               # DOM UI synchronization
│   └── index.ts                  # Exports
│
├── main.ts                       # Application entry point
├── scene.ts                      # Three.js scene setup
├── utils.ts                      # Utility functions
└── style.css                     # UI styles
```

---

## ECS Core

### World

The `World` is the central hub that manages all entities and systems.

```typescript
import { World } from './ecs/World';

const world = new World();
const eventBus = world.getEventBus();

// Add systems (in priority order)
world.addSystem(new TransformSystem(eventBus));
world.addSystem(new MeasuringSystem(world, scene, eventBus));

// Create entities
const entity = world.createEntity('my-entity');
entity.addComponent(new Transform({ position: [0, 1, 0] }));

// In animation loop
function animate() {
  world.update();  // Runs all systems
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

### Entity

Entities are containers for components with a unique ID.

```typescript
const entity = world.createEntity('shape_1');

// Add components
entity.addComponent(new Transform({ position: [0, 1, 0] }));
entity.addComponent(new Shape({ shapeType: 'box', color: 0xff0000 }));

// Query components
const transform = entity.getComponent<Transform>('Transform');
const hasShape = entity.hasComponent('Shape');

// Tags for grouping
entity.addTag('shape');
entity.addTag('draggable');
```

### Component

Components are pure data containers. Create custom components by extending the base class:

```typescript
import { Component } from './ecs/Component';

export class Health extends Component {
  current: number;
  max: number;

  constructor(data?: { current?: number; max?: number }) {
    super('Health');  // Component type name
    this.current = data?.current ?? 100;
    this.max = data?.max ?? 100;
  }

  clone(): Health {
    return new Health({ current: this.current, max: this.max });
  }

  toJSON(): Record<string, unknown> {
    return { type: this.type, current: this.current, max: this.max };
  }
}
```

### System

Systems contain all logic and operate on entities with specific components:

```typescript
import { System } from './ecs/System';
import { EventBus } from './ecs/EventBus';

export class HealthSystem extends System {
  constructor(eventBus: EventBus) {
    super('HealthSystem', eventBus);
    this.setRequiredComponents('Health', 'Transform');
    this.setPriority(50);  // Lower = runs first
  }

  update(deltaTime: number): void {
    for (const entity of this.entities.values()) {
      const health = entity.getComponent<Health>('Health');
      // Process entity...
    }
  }
}
```

---

## Components

### Transform
Position, rotation, and scale in 3D space.

```typescript
new Transform({
  position: [x, y, z],     // or THREE.Vector3
  rotation: [rx, ry, rz],  // Euler angles in radians
  scale: [sx, sy, sz]      // or THREE.Vector3
})
```

### Renderable
Links an entity to a Three.js mesh.

```typescript
new Renderable({
  mesh: threeMesh,
  visible: true,
  castShadow: true,
  receiveShadow: true
})
```

### Measurement
Stores measurement data between two points.

```typescript
new Measurement({
  startPoint: new THREE.Vector3(0, 0, 0),
  endPoint: new THREE.Vector3(5, 0, 0),
  unit: 'm',  // 'm' | 'cm' | 'ft' | 'in'
  startShapeName: 'Box',
  endShapeName: 'Sphere'
})
```

### Interactive
Tracks interaction states for selection, hovering, and dragging.

```typescript
new Interactive({
  selectable: true,
  hoverable: true,
  draggable: true,
  removable: true
})
```

### Snappable
Enables vertex snapping with spatial hashing for performance.

```typescript
const snappable = new Snappable({ snapRadius: 0.6 });
snappable.extractFromMesh(mesh);
snappable.updateWorldVertices(mesh);
```

### Dimension
Visual representation of a measurement (lines, arrows, labels).

```typescript
const dimension = new Dimension({ visible: true });
dimension.setLine(line);
dimension.setArrows(startArrow, endArrow);
dimension.setLabel(labelSprite);
dimension.addToScene(scene);
```

### Shape
Metadata about a shape entity.

```typescript
new Shape({
  shapeType: 'box',  // 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus'
  color: 0x6c63ff,
  size: 1,
  removable: true
})
```

---

## Systems

### System Priority Order

Systems run in priority order (lower number = runs first):

| Priority | System | Responsibility |
|----------|--------|----------------|
| 0 | TransformSystem | Sync Transform components to meshes |
| 5 | InputSystem | Handle mouse/keyboard input |
| 10 | SnappingSystem | Update snap vertex caches |
| 20 | ShapeSystem | Create/remove shapes, undo |
| 30 | MeasuringSystem | Create/manage measurements |
| 40 | DragSystem | Handle shape dragging |
| 50 | SelectionSystem | Apply selection highlighting |
| 100 | UISystem | Update DOM elements |

### TransformSystem
Synchronizes `Transform` component data to Three.js mesh transforms.

### InputSystem
Converts mouse/keyboard events into ECS events:
- `mode:toggle` - Switch app mode (measuring/removing/moving)
- `measure:click` - Click during measurement
- `entity:select` - Select an entity
- `shape:undo` - Undo shape removal

### SnappingSystem
Manages vertex snapping:
- Builds spatial hash for O(1) vertex lookup
- Shows snap indicator at nearest vertex
- Handles `snap:find` and `snap:invalidate` events

### ShapeSystem
Manages shape entities:
- `shape:add` - Create new shape
- `shape:remove` - Remove shape (with undo support)
- `shape:undo` - Restore last removed shape

### MeasuringSystem
Handles measurement creation:
- `measure:activate/deactivate` - Toggle measurement mode
- `measure:click` - Place measurement points
- `measure:completed` - Measurement finished
- `measure:delete` - Remove measurement
- `measure:set-unit` - Change unit

### SelectionSystem
Visual feedback for selected entities:
- `entity:select` - Select entity
- `entity:deselect` - Deselect all
- Applies highlight material to selected shapes/measurements

### DragSystem
Integrates Three.js DragControls with ECS:
- Updates Transform component during drag
- Invalidates snap cache on drag end
- Locks Y-axis for ground-plane movement

### UISystem
Synchronizes ECS state with DOM:
- Updates status badge
- Updates measurement records table
- Manages mode button states

---

## Event Bus

The EventBus enables decoupled communication between systems.

### Emitting Events

```typescript
// From within a system
this.emit('measure:completed', {
  id: 'measurement_1',
  distance: 5.5,
  startPoint: new THREE.Vector3(0, 0, 0),
  endPoint: new THREE.Vector3(5, 0, 0)
});

// From outside
eventBus.emit('mode:toggle', { mode: 'measuring' });
```

### Listening to Events

```typescript
// In system constructor
this.on('measure:completed', (data) => {
  console.log('Measurement completed:', data.id);
});

// One-time listener
this.once('shape:added', (data) => {
  console.log('First shape added:', data.id);
});
```

### Event Reference

| Event | Data | Description |
|-------|------|-------------|
| `mode:toggle` | `{ mode: AppMode }` | Toggle app mode |
| `mode:changed` | `{ mode, previousMode }` | Mode changed |
| `measure:activate` | `{}` | Enter measuring mode |
| `measure:deactivate` | `{}` | Exit measuring mode |
| `measure:click` | `{ point, snappedPoint }` | Click during measurement |
| `measure:completed` | `{ id, distance, startPoint, endPoint }` | Measurement finished |
| `measure:delete` | `{ id }` | Delete measurement |
| `measure:clear-all` | `{}` | Clear all measurements |
| `measure:set-unit` | `{ unit }` | Change unit |
| `entity:select` | `{ id }` | Select entity |
| `entity:deselect` | `{}` | Deselect all |
| `selection:changed` | `{ entityId, selected }` | Selection changed |
| `shape:add` | `{ type }` | Add new shape |
| `shape:remove` | `{ id }` | Remove shape |
| `shape:undo` | `{}` | Undo shape removal |
| `snap:find` | `{ point }` | Find snap target |
| `snap:invalidate` | `{}` | Invalidate snap caches |
| `drag:start` | `{ object }` | Drag started |
| `drag:end` | `{ object }` | Drag ended |

---

## Usage Guide

### Running the Application

```bash
npm install
npm run dev
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Cancel measurement / Deselect |
| `E` | Erase selected measurement |
| `M` | Change selected measurement unit |
| `C` | Cycle global unit |
| `Ctrl+Z` | Undo shape removal |

### Adding a Custom Shape

```typescript
// Emit event to add shape
eventBus.emit('shape:add', { type: 'sphere' });
```

### Creating a Measurement Programmatically

```typescript
const measuringSystem = world.getSystem<MeasuringSystem>('MeasuringSystem');
measuringSystem.activate();
measuringSystem.handleClick(new THREE.Vector3(0, 0, 0));
measuringSystem.handleClick(new THREE.Vector3(5, 0, 0));
```

---

## Adding New Features

### 1. Create a New Component

```typescript
// src/components/Velocity.ts
import { Component } from '../ecs/Component';
import * as THREE from 'three';

export class Velocity extends Component {
  velocity: THREE.Vector3;

  constructor(data?: { velocity?: THREE.Vector3 }) {
    super('Velocity');
    this.velocity = data?.velocity?.clone() ?? new THREE.Vector3();
  }

  clone(): Velocity {
    return new Velocity({ velocity: this.velocity.clone() });
  }

  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      velocity: [this.velocity.x, this.velocity.y, this.velocity.z]
    };
  }
}
```

### 2. Create a New System

```typescript
// src/systems/PhysicsSystem.ts
import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { Transform } from '../components/Transform';
import { Velocity } from '../components/Velocity';

export class PhysicsSystem extends System {
  constructor(eventBus: EventBus) {
    super('PhysicsSystem', eventBus);
    this.setRequiredComponents('Transform', 'Velocity');
    this.setPriority(15);
  }

  update(deltaTime: number): void {
    const dt = deltaTime / 1000;  // Convert to seconds

    for (const entity of this.entities.values()) {
      const transform = entity.getComponent<Transform>('Transform');
      const velocity = entity.getComponent<Velocity>('Velocity');

      if (transform && velocity) {
        transform.position.add(velocity.velocity.clone().multiplyScalar(dt));
        transform.dirty = true;
      }
    }
  }
}
```

### 3. Register the System

```typescript
// In main.ts
import { PhysicsSystem } from './systems/PhysicsSystem';

world.addSystem(new PhysicsSystem(eventBus));
```

---

## Best Practices

### Components
- Keep components as pure data (no logic)
- Use primitive types or Three.js types
- Implement `clone()` and `toJSON()` methods

### Systems
- One responsibility per system
- Use events for cross-system communication
- Set appropriate priority for execution order
- Clean up resources in `onDestroy()`

### Performance
- Use spatial hashing for large datasets (see `Snappable`)
- Cache computed values when possible
- Use object pooling for frequently created objects
- Avoid allocations in update loops (use temp vectors)

### Events
- Use consistent naming: `domain:action` (e.g., `measure:completed`)
- Keep event payloads minimal
- Clean up listeners in `onDestroy()`

---

## Debugging

### Enable Debug Mode

```typescript
eventBus.setDebugMode(true);  // Logs all events
```

### Log World State

```typescript
world.logState();
// Outputs: entities, components, systems
```

### Access World from Console

```typescript
// In development mode, world is exposed on window
window.ecsWorld.logState();
window.ecsWorld.getEntities();
window.ecsWorld.getSystem('MeasuringSystem');
```

### Event History

```typescript
const history = eventBus.getHistory(10);  // Last 10 events
console.log(history);
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **Measurements not showing in table** | Entity not injected into system | Call `world.entityChanged(entity)` after adding components |
| **Snap indicator not appearing** | Vertex cache not built | Ensure `snappable.extractFromMesh(mesh)` is called |
| **Shapes can't be dragged** | Wrong mode active | Click "Move Shape" button to enter moving mode |
| **Measurement line disappears** | Entity removed from world | Check if entity exists with `world.hasEntity(id)` |
| **UI not updating** | Event not emitted | Verify event is emitted with `eventBus.setDebugMode(true)` |

### Console Debugging

```typescript
// Check all entities
window.ecsWorld.getEntities().forEach(e => console.log(e.id, e.getComponentTypes()));

// Check specific system
const measuringSystem = window.ecsWorld.getSystem('MeasuringSystem');
console.log('Measurements:', measuringSystem.measurementCount);

// Check event history
console.log(window.ecsWorld.getEventBus().getHistory(20));

// Force UI update
window.ecsWorld.getSystem('UISystem').updateAll();
```

### Performance Tips

1. **Reduce vertex count** - Use lower polygon shapes for better snapping performance
2. **Limit measurements** - Clear old measurements when not needed
3. **Disable debug mode** - Turn off `eventBus.setDebugMode(false)` in production
4. **Use object pooling** - Reuse Three.js geometries and materials

---

## API Reference

### World Methods

```typescript
// Entity Management
world.createEntity(id: string): Entity
world.removeEntity(id: string): boolean
world.getEntity(id: string): Entity | undefined
world.hasEntity(id: string): boolean
world.getEntities(): Entity[]
world.getEntitiesWith(...componentTypes: string[]): Entity[]
world.getEntitiesWithTag(tag: string): Entity[]
world.entityChanged(entity: Entity): void  // Re-inject entity into systems

// System Management
world.addSystem(system: System): void
world.removeSystem(name: string): boolean
world.getSystem<T>(name: string): T | undefined
world.getSystems(): System[]

// Lifecycle
world.update(): void  // Run all systems
world.destroy(): void // Clean up all resources

// Event Bus
world.getEventBus(): EventBus
```

### Entity Methods

```typescript
// Components
entity.addComponent(component: Component): void
entity.removeComponent(type: string): boolean
entity.getComponent<T>(type: string): T | undefined
entity.hasComponent(type: string): boolean
entity.hasComponents(...types: string[]): boolean
entity.getComponents(): Component[]
entity.getComponentTypes(): string[]

// Tags
entity.addTag(tag: string): void
entity.removeTag(tag: string): boolean
entity.hasTag(tag: string): boolean
entity.getTags(): string[]

// State
entity.setActive(active: boolean): void
entity.isActive(): boolean

// Serialization
entity.clone(): Entity
entity.toJSON(): object
```

### EventBus Methods

```typescript
eventBus.on(event: string, handler: Function): void
eventBus.once(event: string, handler: Function): void
eventBus.off(event: string, handler: Function): void
eventBus.emit(event: string, data: object): void
eventBus.getHistory(count: number): EventRecord[]
eventBus.setDebugMode(enabled: boolean): void
eventBus.clear(): void
```

---

## Unit Conversion Reference

| From | To Meters | Formula |
|------|-----------|---------|
| Meters (m) | 1 | `value` |
| Centimeters (cm) | 0.01 | `value / 100` |
| Feet (ft) | 0.3048 | `value * 0.3048` |
| Inches (in) | 0.0254 | `value * 0.0254` |

### Supported Units

```typescript
type Unit = 'm' | 'cm' | 'ft' | 'in';

// Unit display labels
const UNIT_LABELS = {
  m: 'Meters',
  cm: 'Centimeters', 
  ft: 'Feet',
  in: 'Inches'
};
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a Pull Request

### Code Style

- Use TypeScript strict mode
- Follow ECS patterns (data in components, logic in systems)
- Use EventBus for cross-system communication
- Add JSDoc comments for public methods

---

## License

MIT License - See LICENSE file for details.

---

## Acknowledgments

- [Three.js](https://threejs.org/) - 3D rendering library
- [Vite](https://vitejs.dev/) - Build tool
- [TypeScript](https://www.typescriptlang.org/) - Type safety
