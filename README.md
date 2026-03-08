# Three.js Measurement Tool

An optimized Three.js playground for measuring distances directly on 3D models. The app ships with performant snapping, live distance previews, undoable shape edits, and a responsive UI that works across desktop, tablet, and mobile.

---

## ✨ Features
- **Precision measuring** – click two points on any mesh (or the ground plane) to create accurate dimension lines with arrowheads, ticks, and labels.
- **Smart snapping** – fast vertex snapping powered by cached geometry data and spatial hashing.
- **Live preview** – see real-time distance updates while hovering for the second point.
- **Measurement table** – resizable desktop panel + mobile-friendly cards listing shape-to-shape distances, with select and delete actions.
- **Unit dropdown** – floating badge lets you switch between meters, centimeters, feet, and inches without touching the keyboard.
- **Scene editing** – add/remove/move sample primitives (box, sphere, cylinder, cone, torus) with drag controls and undo for deletions.
- **Responsive UI** – floating panels rearrange and restyle themselves for small screens; measurement table can be resized to your liking on desktop.
- **Performance-minded** – shared geometries/materials, throttled mouse handlers, cached vertices, and zero-allocation math in hot paths.

---

## 🧱 Tech Stack
- [Three.js](https://threejs.org/) – rendering & interaction
- [Vite](https://vitejs.dev/) – dev server & bundler
- [TypeScript](https://www.typescriptlang.org/) – type safety

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Type-check + build for production
npm run build

# Preview production build
npm run preview
```

> **Node requirement**: Node 18+ is recommended (Vite 5/7 baseline).

---

## 🎯 Usage Guide

| Action | Steps |
| --- | --- |
| **Measure distance** | Click **Measure** → click first point → move mouse (see live preview) → click second point → repeat. |
| **Select measurement** | In Idle mode, click a line or click a row in the table. Selected lines glow yellow. |
| **Delete measurement** | Press **E**, or use the delete (✖) button in the table. |
| **Change units (selection)** | Press **M** while a measurement is selected. |
| **Cycle units (all)** | Press **C** in Idle mode or use the Unit dropdown (m/cm/ft/in). |
| **Cancel / Deselect** | Press **Esc** (cancels in-progress measurement or clears selection). |
| **Add figure** | Click **Add Figure ▾**, choose a primitive (Box/Sphere/Cylinder/Cone/Torus). Menu remains open until you select or click outside. |
| **Remove figure** | Enable **Remove Shape**, then click a mesh. Undo via the ↩ Undo button or `Ctrl+Z`. |
| **Move figure** | Enable **Move Shape**, drag any mesh (Three.js DragControls). |
| **Resize measurement table** | On desktop, drag the bottom-right corner of the table panel (limits: 260–600px width, min height 220px). |

### Measuring Workflow (Step-by-Step)
1. **Activate Measure mode** – toggle the "📏 Measure" button. Cursor switches to a crosshair.
2. **First click** – snap to a vertex or click anywhere on a mesh/ground to drop the start point.
3. **Hover** – move the mouse; the dashed preview line and floating label show a live distance.
4. **Second click** – finalizes the measurement, drawing arrows, ticks, label, and adds a row to the records table.
5. **Repeat** – stay in Measure mode to keep adding measurements, or click the button again to exit.

### Managing Measurements
- **Selection** – either click a line in the scene or the corresponding row in the records table. Selected items turn yellow, and keyboard shortcuts become available.
- **Deletion** – press `E`, hit the row’s ✖ button, or use the Clear All button to remove everything.
- **Unit Switching** – `M` cycles the unit for the selected measurement (m → cm → mm), while `C` changes the unit for *all* measurements simultaneously.
- **Live Table Sync** – every measurement is mirrored in the records table with From/To shape tags, distance, and actions.

### Working with Shapes
- **Add Primitives** – the dropdown spawns new meshes at spaced positions so they don’t overlap.
- **Move Mode** – switch to "🤚 Move Shape" to drag meshes with the mouse (Three.js DragControls are temporarily enabled).
- **Remove Mode** – switch to "🗑 Remove Shape" and click any mesh to delete it. The **↩ Undo** button (or `Ctrl+Z`) restores the last removed mesh.

### Keyboard Shortcuts Summary
| Key | Action |
| --- | --- |
| `Esc` | Cancel current measurement / Deselect selected line |
| `E` | Delete selected measurement |
| `M` | Cycle unit for selected measurement |
| `C` | Cycle unit globally |
| `Ctrl+Z` / `Cmd+Z` | Undo last shape removal |


---

## 📐 Measurement Table
- Desktop: floating, resizable glass panel with a scrollbar + sticky header.
- Tablet: panel centers at bottom and auto-scales width/height.
- Mobile: converts to stacked cards without a header row; each cell gains `data-label` captions for readability.
- Interactive rows: clicking selects the measurement in 3D; delete button removes it.

---

## ⚙️ Key Optimizations
- Cached vertex extraction (`WeakMap` + integer spatial hash) to avoid re-reading buffer attributes on every mouse move.
- Dedicated snap-target list to skip expensive `scene.traverse` calls when finding nearest vertices.
- Shared geometries/materials and controlled disposal for measurement meshes.
- Reusable temp vectors/quaternions (no per-frame allocations) for arrowheads and extension lines.
- Throttled mouse move handler (~60 FPS cap) for smoother snapping.
- Preview line buffer reuse + live sprite with a single canvas texture.
- Responsive CSS with media queries and layout tweaks to minimize overlap and ensure usability on phones.

---

## 🧪 Testing Checklist
- `npm run build` – ensures both TypeScript and Vite builds succeed.
- Manual smoke tests:
  - Draw measurements on multiple primitives and the ground plane.
  - Verify snapping indicator shows/hides correctly.
  - Add/remove/move figures, then undo removals.
  - Resize measurement table on desktop; confirm it docks properly on smaller breakpoints.
  - Test keyboard shortcuts (`E`, `M`, `C`, `Esc`, `Ctrl+Z`).

---

## �️ Screenshots

| Scene Overview | Measuring Lines | Measurement Records |
| --- | --- | --- |
| ![Scene Overview](docs/screenshots/scene-overview.png) | ![Measuring Lines](docs/screenshots/measuring-lines.png) | ![Measurement Records](docs/screenshots/records-panel.png) |

| Toolbar Controls | Shortcuts Panel |
| --- | --- |
| ![Toolbar](docs/screenshots/toolbar.png) | ![Shortcuts Panel](docs/screenshots/shortcuts.png) |

> Save the provided PNGs under `docs/screenshots/` with the names above (or adjust paths if you prefer a different structure).

---

## �� Project Structure
```
three-measurement/
├── index.html                # root HTML + floating UI panels
├── src/
│   ├── main.ts               # bootstrap, controls, measurement system wiring
│   ├── MeasurementSystem.ts  # measurement logic, snapping, rendering
│   ├── utils.ts              # helpers: distance, caching, throttling, etc.
│   ├── scene.ts              # Three.js scene setup + figure management
│   └── style.css             # glassmorphic UI + responsive layout
├── public/                   # (optional) static assets
├── package.json
└── vite.config.ts (if added later)
```

---

## 🙌 Contributions & Notes
- Feel free to fork and plug in your own GLTF/OBJ assets — just add them to `scene.ts` and include them in `sceneObjects` for snapping.
- If you introduce new shared meshes/materials, register them in `MeasurementSystem.sharedResources` so disposal skips them.
- For larger scenes, consider populating `sceneObjects` dynamically when loading models to keep snapping efficient.

Enjoy measuring in 3D! 🧭
