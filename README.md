# Walkthrough Studio

Interactive 3D house viewer with a built-in editor for surface textures and scene lighting. Browse the model in first person, paint bodies and individual CAD faces with triplanar-projected images, and place box / sphere / spot emitters that the FPS view replays in real time.

The UI ships in Spanish; the code and documentation are in English.

## Features

- **Walkthrough**: first-person controls over the house model (WASD + mouse,
  sprint, vertical fly, optional grid / axes helpers).
- **Texture painting**: upload images, paint whole bodies or flood-filled
  CAD faces. Triplanar projection means the model's UVs are irrelevant.
- **Light editor**: place box (RectAreaLight), sphere (PointLight), and
spot (SpotLight) emitters. Each light has a transform gizmo (translate / rotate / scale), color, intensity, clone, and delete.
- **Real-time shadows**: spot and sphere lights cast shadows that occlude
  through walls. Box lights do not (a three.js RectAreaLight limitation).
- **Time of day**: single slider drives sun position, sky color, ambient
  mix and a moon fill light. Shared between the walkthrough and the editor.
- **Auto-save**: every change is written to browser storage. The walkthrough
  picks up edits made in the editor without an explicit export step.

## Tech stack

- **React 19** + **TypeScript** (strict)
- **@react-three/fiber** + **@react-three/drei** + **three.js r0.184**
- **Vite** for dev server and bundling
- Browser storage: textures in **IndexedDB**, paint map / lights / time-of-day
  in **localStorage**: no backend involved

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # production bundle to dist/
npm run preview  # serve the built bundle locally
npm run lint     # eslint pass over the project
npm run typecheck          # tsc over the frontend, the server and the tooling config
npm run build:demo-house   # regenerate public/demo/house.glb
```

## Project structure

The codebase follows a screaming-architecture layout: top-level folders name what the app does, not what tech it uses.

```
src/
├── pages/             Routed top-level views (LandingPage, WalkthroughPage, TextureToolPage)
├── components/
│   ├── atoms/         Smallest UI primitives (Button, Kbd, Hint, BackLink, …)
│   ├── molecules/     Composed controls (SegmentedControl, LabeledSlider, ColorField, …)
│   └── organisms/     Feature-scoped compositions (TexturePanel, LightList, LightEditor, …)
├── features/
│   ├── house/         FBX / glTF loader, material normalization, model settings
│   ├── fps/           First-person camera controls
│   ├── lighting/      Sun/moon model, user-placed lights, time-of-day hook
│   ├── painting/      Triplanar material, flood-fill, face manager, paint persistence
│   └── controls/      Fusion 360-style orbit / pan / zoom
└── styles/            index.css (variables) · app.css (pages) · components.css (UI)
```

## Controls

### Walkthrough

| Key       | Action                          |
| --------- | ------------------------------- |
| `W A S D` | Move                            |
| Mouse     | Look around                     |
| `Shift`   | Sprint                          |
| `↑ / ↓`   | Ascend / descend                |
| `[ / ]`   | Hour −/+ 30 minutes             |
| `G`       | Toggle grid helper              |
| `H`       | Toggle axes helper              |
| `Esc`     | Release pointer lock            |

### Scene editor

| Input              | Action                                            |
| ------------------ | ------------------------------------------------- |
| Middle-mouse drag  | Pan camera                                        |
| `Shift` + MMB drag | Orbit camera                                      |
| Mouse wheel        | Zoom                                              |
| Left-click (paint) | Paint body / face with the selected texture      |
| Left-click (lights)| Select a light                                    |
| Gizmo handles      | Translate / rotate / scale the selected light    |
| `Esc`              | Deselect texture or light                         |

## Notes

The house model is loaded by `features/house/House.tsx`, which normalizes units (mm / cm / m), materials (Phong → MeshStandard) and undefined material slots at load time. FBX models also get their up-axis detected from the bounding box, which suits a Fusion 360 export; glTF is Y-up by specification, so that step is skipped. Triplanar projection is used for all painting because CAD exports rarely carry usable UVs.

## Configuration

The server and the model are configured through environment variables, documented in `.env.example`. Copy it to `.env.local` (git-ignored) to override the defaults.

| Variable                     | Applies to | Default            | Meaning                                                                                      |
| ---------------------------- | ---------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `HOST`                       | API        | `127.0.0.1`        | Interface the API binds to. The API has no authentication, so keep it on loopback.           |
| `PORT`                       | API        | `3001`             | API port. The Vite dev proxy reads the same variable.                                        |
| `DATA_DIR`                   | API        | `server/data`      | Where `scene.json` and the uploaded textures are stored.                                     |
| `VITE_HOUSE_URL`             | Frontend   | `/demo/house.glb`  | Model to load. `.fbx` uses the FBX loader, `.glb` / `.gltf` the glTF loader.                 |
| `VITE_HOUSE_SPAWN`           | Frontend   | `-2,0`             | First-person spawn point as `x,z` in meters, relative to the centered model.                 |
| `VITE_HOUSE_GROUND_HINTS`    | Frontend   | none               | Comma-separated mesh-name fragments. The top of the first match is placed at `y = 0`.        |
| `VITE_SUN_PATH_ROTATION_DEG` | Frontend   | `0`                | Rotates the sun arc around the Y axis so sunrise and sunset line up with the model's facade. |
| `VITE_SITE_URL`              | Frontend   | none               | Public base URL, such as `https://walk.example.com` or `https://example.com/walk` for a sub-path. Makes the social preview image URLs absolute and adds `og:url`. |

The bundled demo house (`public/demo/house.glb`) is generated by `npm run build:demo-house` from pieces of Kenney's Building Kit (CC0). The source pieces and license live in `assets-src/kenney-building-kit/`, the license is also copied to `public/demo/LICENSE-kenney.txt`. To walk through your own FBX instead, place it in `public/` (`*.fbx` is git-ignored) and set `VITE_HOUSE_URL=/YourHouse.fbx`, plus the spawn, ground and sun settings that fit it.
