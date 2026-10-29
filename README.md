<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg">
    <img src="docs/assets/brand/banner-light.svg" alt="Walkthrough Studio: Paint the walls before you buy the paint." width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger/walkthrough-studio/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kfeuerschvenger/walkthrough-studio/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-f99a1c?style=flat-square" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/Node-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/three.js-r184-000000?style=flat-square&logo=threedotjs&logoColor=white" alt="three.js r184">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="Express 5">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center"><strong>English</strong> · <a href="README_es.md">Español</a></p>

<p align="center">
  <img src="docs/assets/screens/hero.gif" alt="In the scene editor a brick texture is picked and painted on a wall, then the time slider moves from noon to night while the sky darkens and the lamps turn on" width="100%">
</p>

**Walkthrough Studio is a 3D house viewer with a paint and lighting editor, built to try things on a home before touching a single wall.**

Load a model, walk through it in first person, and paint walls and floors with any image you upload. Drop in lamps, then drag the clock and watch the same room go from noon to night. Measure twice, paint once, except here you can repaint as many times as you like for free.

The project started as a way to plan a real home: furniture, appliances, lights and finishes, judged in the room itself instead of on a swatch card. The sun does the lighting work for free, so you can see how the living room looks at 6 PM without waiting for 6 PM, and you can try fourteen tile options without ever visiting a hardware store.

The interface ships in Spanish for now; code and docs are in English, and a language switch is the first item on the [roadmap](docs/ROADMAP.md).

## Take the tour

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/walkthrough-day.png" alt="First-person view of a living room by day, with a wood floor, brick window frames and the sky outside">
      <p><strong>Walk in.</strong> First-person controls, a sprint key and a fly mode. The same scene you painted in the editor is waiting, textures and lamps included.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/walkthrough-dusk.png" alt="The same living room view at dusk, with the lamps on">
      <p><strong>Same room, 6 PM.</strong> One slider moves the sun, the sky, the shadows and the moon. Lamps fade in as the light goes, so evening looks like evening.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/texture-editor.png" alt="The scene editor with a house whose walls and floors are painted with brick, wood and plaster textures">
      <p><strong>Paint a whole body or a single face.</strong> Upload an image, pick it, and click. Flood-filled faces let you give one wall its own colour even when the model is a single mesh.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/light-editor.png" alt="The light editor at night with a selected sphere light, a transform gizmo and the lights list">
      <p><strong>Lights you can grab.</strong> Box, sphere and spot emitters with a move, rotate and scale gizmo, a colour and an intensity. Try the lamp in the corner before you drill the ceiling.</p>
    </td>
  </tr>
</table>

### Why it feels like a workshop

- **Textures that ignore UVs.** Painting uses triplanar projection, so a CAD export with unusable UVs looks as good as a game-ready model, and the tile size is set in real meters.
- **Autosave you can trust.** Every change is saved to the server a moment after you stop touching it, one write at a time, so closing the tab never eats your wall.
- **One scene, two views.** The editor and the walkthrough read the same saved scene, so there is no export step between painting and walking.
- **Your house, not just ours.** A CC0 demo house is bundled, and any FBX or glTF model can take its place.

Everything you do in the editor ends up in the walkthrough:

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#ffe2b8", "primaryBorderColor": "#c97608", "primaryTextColor": "#7a4704", "lineColor": "#f99a1c", "textColor": "#7a4704", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Pick["Pick or upload<br/>a texture"] --> Paint["Paint a body<br/>or a face"]
  Paint --> Save[("Autosave<br/>scene.json")]
  Lamps["Place lamps<br/>and set the hour"] --> Save
  Save --> Walk["Walk through<br/>in first person"]
  Walk -.->|"too bright? back to the editor"| Pick
  classDef paint fill:#ffe2b8,stroke:#c97608,color:#7a4704
  classDef light fill:#fff0d9,stroke:#ffb347,color:#7a4704
  classDef sky fill:#bde0ff,stroke:#2b5f8f,color:#16395a
  classDef night fill:#1a2540,stroke:#1a2540,color:#ffffff
  class Pick,Paint paint
  class Lamps light
  class Walk sky
  class Save night
```

## Under the hood

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/architecture-dark.svg">
  <img src="docs/assets/diagrams/architecture.svg" alt="The React single page app holds the scene in one provider and talks to an Express API, which validates every request and stores scene.json and the texture files on disk; the same server serves the built app and your own model files" width="100%">
</picture>

A React single page app renders the scene with three.js through react-three-fiber, and keeps everything that persists in one provider. A small Express API validates each request, writes files atomically through a single queue, and refuses requests from other origins, because it has no login and listens on loopback by default. Paints are stored as a few numbers per face and rediscovered by flood fill on every load, so a saved scene stays tiny.

<p align="center">
  <img src="https://skillicons.dev/icons?i=react" alt="React" title="React" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=ts" alt="TypeScript" title="TypeScript" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=threejs" alt="three.js" title="three.js" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=vite" alt="Vite" title="Vite" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=nodejs" alt="Node.js" title="Node.js" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=express" alt="Express" title="Express" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=docker" alt="Docker" title="Docker" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=githubactions" alt="GitHub Actions" title="GitHub Actions" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=vitest" alt="Vitest" title="Vitest" width="48">&nbsp;
  <img src="https://skillicons.dev/icons?i=playwright" alt="Playwright" title="Playwright" width="48">
</p>

## Quick start

You need Node 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and pick the walkthrough or the scene editor.

> [!TIP]
> Prefer a container? `docker compose up -d` builds the image and serves everything on http://localhost:3001. Every variable, the Docker details and LAN access are in [ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Bring your own house

The bundled house is a small demo assembled from CC0 pieces. To walk through your own model, point the app at an FBX or glTF file with `VITE_HOUSE_URL`, and tell it where to start with `VITE_HOUSE_SPAWN`:

```bash
# .env.local
VITE_HOUSE_URL=/models/MyHouse.fbx
VITE_HOUSE_SPAWN=0,0
```

The API serves the folder named by `MODELS_DIR` at `/models`, so start it with `MODELS_DIR=./models`. Models stay out of git: the `*.fbx` pattern is ignored, and in Docker the folder is mounted read-only at `/models`. Units, the up axis and the ground level are detected at load time. The full recipe, including the sun direction and the ground hints, is in [ENVIRONMENT.md](docs/ENVIRONMENT.md#bring-your-own-house).

## Dive deeper

The README is the showroom. The deep docs are the workshop.

| Document | The hook |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | The frontend, how a scene is saved, triplanar and per-face painting, the sun and the lights, and the server |
| [Environment](docs/ENVIRONMENT.md) | Every variable and script, Docker, your own model and LAN access |
| [Controls](docs/CONTROLS.md) | Keyboard and mouse for the walkthrough and the editor |
| [API](docs/API.md) | The scene and texture endpoints, limits and error answers |
| [Testing](docs/TESTING.md) | What each suite covers, how to run it, and the pipeline that takes these screenshots |
| [CI](docs/CI.md) | The three jobs, the audit gate and the branch flow |
| [Roadmap](docs/ROADMAP.md) | What comes next, starting with a language switch |

---

<p align="center">
  <strong>Made in Patagonia · 50°20′S</strong><br>
  Built with care (and a lot of paint swatches) by <strong>Kevin Feuerschvenger</strong> · Software Engineer
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger"><img src="https://img.shields.io/badge/GitHub-kfeuerschvenger-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/kevin-feuerschvenger/"><img src="https://img.shields.io/badge/LinkedIn-kevin--feuerschvenger-0A66C2?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0yMC40NSAyMC40NWgtMy41NnYtNS41N2MwLTEuMzMtLjAyLTMuMDQtMS44NS0zLjA0LTEuODUgMC0yLjE0IDEuNDUtMi4xNCAyLjk0djUuNjdIOS4zNVY5aDMuNDF2MS41NmguMDVjLjQ4LS45IDEuNjQtMS44NSAzLjM3LTEuODUgMy42IDAgNC4yNyAyLjM3IDQuMjcgNS40NnY2LjI4ek01LjM0IDcuNDNhMi4wNiAyLjA2IDAgMSAxIDAtNC4xMyAyLjA2IDIuMDYgMCAwIDEgMCA0LjEzek03LjEyIDIwLjQ1SDMuNTZWOWgzLjU2djExLjQ1eiIvPjwvc3ZnPg%3D%3D" alt="LinkedIn"></a>
  <a href="https://feuerschvenger.com/"><img src="https://img.shields.io/badge/Portfolio-feuerschvenger.com-c97608?style=flat-square&logo=googlechrome&logoColor=white" alt="Portfolio"></a>
</p>

<p align="center"><sub>Released under the <a href="LICENSE">MIT licence</a>, with third-party assets credited there.</sub></p>
