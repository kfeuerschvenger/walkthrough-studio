<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg">
    <img src="docs/assets/brand/banner-light.svg" alt="Walkthrough Studio: Paint the walls before you buy the paint." width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger/walkthrough-studio/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kfeuerschvenger/walkthrough-studio/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white" alt="Estado de CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-f99a1c?style=flat-square" alt="Licencia MIT"></a>
  <img src="https://img.shields.io/badge/Node-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/three.js-r184-000000?style=flat-square&logo=threedotjs&logoColor=white" alt="three.js r184">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="Express 5">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center"><a href="README.md">English</a> · <strong>Español</strong></p>

<p align="center">
  <img src="docs/assets/screens/hero.gif" alt="En el editor de escena se elige una textura de ladrillo y se pinta una pared; luego el control de hora pasa de mediodía a noche mientras el cielo se oscurece y se encienden las lámparas" width="100%">
</p>

**Walkthrough Studio es un visor 3D de casas con un editor de pintura e iluminación, pensado para probar cosas en un hogar antes de tocar una sola pared.**

Carga un modelo, recórrelo en primera persona y pinta paredes y pisos con cualquier imagen que subas. Coloca lámparas y arrastra el reloj para ver el mismo ambiente pasar del mediodía a la noche. Mide dos veces, pinta una, salvo que aquí puedes repintar todas las veces que quieras sin gastar nada.

El proyecto nació como una forma de planificar una casa real: muebles, electrodomésticos, luces y terminaciones, evaluados dentro del ambiente y no sobre una muestra de catálogo. El sol hace el trabajo de iluminación gratis, así que puedes ver cómo queda el living a las 6 PM sin esperar las 6 PM, y probar catorce opciones de baldosas sin pisar una ferretería.

Por ahora la interfaz está en español; el código y la documentación técnica están en inglés, y un selector de idioma es el primer punto de la [hoja de ruta](docs/ROADMAP.md).

## Recorrido

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/walkthrough-day.png" alt="Vista en primera persona de un living de día, con piso de madera, marcos de ventana de ladrillo y el cielo afuera">
      <p><strong>Entra.</strong> Controles en primera persona, tecla para correr y modo vuelo. La misma escena que pintaste en el editor te espera, con texturas y lámparas incluidas.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/walkthrough-dusk.png" alt="La misma vista del living al atardecer, con las lámparas encendidas">
      <p><strong>Mismo ambiente, 6 PM.</strong> Un solo control mueve el sol, el cielo, las sombras y la luna. Las lámparas se encienden a medida que cae la luz, así el atardecer se ve como atardecer.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/texture-editor.png" alt="El editor de escena con una casa cuyas paredes y pisos están pintados con texturas de ladrillo, madera y yeso">
      <p><strong>Pinta un cuerpo entero o una sola cara.</strong> Sube una imagen, elígela y haz clic. Las caras por relleno permiten darle a una pared su propia textura aunque el modelo sea una única malla.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/light-editor.png" alt="El editor de luces de noche con una luz esférica seleccionada, un gizmo de transformación y la lista de luces">
      <p><strong>Luces que puedes agarrar.</strong> Emisores caja, esfera y foco con gizmo para mover, rotar y escalar, además de color e intensidad. Prueba la lámpara del rincón antes de perforar el techo.</p>
    </td>
  </tr>
</table>

### Por qué se siente como un taller

- **Texturas que ignoran las UV.** La pintura usa proyección triplanar, así que una exportación CAD con UV inservibles se ve tan bien como un modelo hecho para juegos, y el tamaño del mosaico se define en metros reales.
- **Autoguardado confiable.** Cada cambio se guarda en el servidor un instante después de que dejas de tocar, de a una escritura por vez, así que cerrar la pestaña no se come tu pared.
- **Una escena, dos vistas.** El editor y el recorrido leen la misma escena guardada, sin un paso de exportación entre pintar y caminar.
- **Tu casa, no solo la nuestra.** Se incluye una casa de demostración CC0, y cualquier modelo FBX o glTF puede ocupar su lugar.

Todo lo que haces en el editor termina en el recorrido:

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#ffe2b8", "primaryBorderColor": "#c97608", "primaryTextColor": "#7a4704", "lineColor": "#f99a1c", "textColor": "#7a4704", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Pick["Elegir o subir<br/>una textura"] --> Paint["Pintar un cuerpo<br/>o una cara"]
  Paint --> Save[("Autoguardado<br/>scene.json")]
  Lamps["Colocar lámparas<br/>y fijar la hora"] --> Save
  Save --> Walk["Recorrer<br/>en primera persona"]
  Walk -.->|"¿demasiado claro? de vuelta al editor"| Pick
  classDef paint fill:#ffe2b8,stroke:#c97608,color:#7a4704
  classDef light fill:#fff0d9,stroke:#ffb347,color:#7a4704
  classDef sky fill:#bde0ff,stroke:#2b5f8f,color:#16395a
  classDef night fill:#1a2540,stroke:#1a2540,color:#ffffff
  class Pick,Paint paint
  class Lamps light
  class Walk sky
  class Save night
```

## Bajo el capó

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/architecture-dark.svg">
  <img src="docs/assets/diagrams/architecture.svg" alt="La aplicación React de una sola página mantiene la escena en un proveedor y habla con una API Express, que valida cada solicitud y guarda scene.json y los archivos de texturas en disco; el mismo servidor entrega la aplicación compilada y tus propios archivos de modelo" width="100%">
</picture>

Una aplicación React de una sola página dibuja la escena con three.js a través de react-three-fiber y concentra todo lo que persiste en un único proveedor. Una API Express pequeña valida cada solicitud, escribe archivos de forma atómica a través de una sola cola y rechaza solicitudes de otros orígenes, porque no tiene inicio de sesión y escucha solo en loopback por defecto. Las pinturas se guardan como unos pocos números por cara y se redescubren por relleno en cada carga, así que una escena guardada pesa muy poco.

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

## Inicio rápido

Necesitas Node 22 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:5173 y elige el recorrido o el editor de escena.

> [!TIP]
> ¿Prefieres un contenedor? `docker compose up -d` construye la imagen y lo sirve todo en http://localhost:3001. Todas las variables, los detalles de Docker y el acceso desde la red local están en [ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Trae tu propia casa

La casa incluida es una demostración pequeña armada con piezas CC0. Para recorrer tu propio modelo, apunta la aplicación a un archivo FBX o glTF con `VITE_HOUSE_URL` e indica dónde empezar con `VITE_HOUSE_SPAWN`:

```bash
# .env.local
VITE_HOUSE_URL=/models/MyHouse.fbx
VITE_HOUSE_SPAWN=0,0
```

La API sirve en `/models` la carpeta indicada por `MODELS_DIR`, así que inicia con `MODELS_DIR=./models`. Los modelos quedan fuera de git: el patrón `*.fbx` se ignora y, en Docker, la carpeta se monta de solo lectura en `/models`. Las unidades, el eje vertical y el nivel del suelo se detectan al cargar. La receta completa, con la dirección del sol y las pistas de suelo, está en [ENVIRONMENT.md](docs/ENVIRONMENT.md#bring-your-own-house).

## Profundiza

El README es la sala de exhibición. Los documentos técnicos son el taller. Están en inglés.

| Documento | El gancho |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | El frontend, cómo se guarda una escena, la pintura triplanar y por cara, el sol y las luces, y el servidor |
| [Environment](docs/ENVIRONMENT.md) | Todas las variables y scripts, Docker, tu propio modelo y el acceso desde la red local |
| [Controls](docs/CONTROLS.md) | Teclado y mouse para el recorrido y el editor |
| [API](docs/API.md) | Los endpoints de escena y texturas, límites y respuestas de error |
| [Testing](docs/TESTING.md) | Qué cubre cada suite, cómo ejecutarla y el pipeline que toma estas capturas |
| [CI](docs/CI.md) | Los tres jobs, la puerta de auditoría y el flujo de ramas |
| [Roadmap](docs/ROADMAP.md) | Lo que viene, empezando por un selector de idioma |

---

<p align="center">
  <strong>Hecho en la Patagonia · 50°20′S</strong><br>
  Construido con cariño (y muchas muestras de pintura) por <strong>Kevin Feuerschvenger</strong> · Software Engineer
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger"><img src="https://img.shields.io/badge/GitHub-kfeuerschvenger-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/kevin-feuerschvenger/"><img src="https://img.shields.io/badge/LinkedIn-kevin--feuerschvenger-0A66C2?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0yMC40NSAyMC40NWgtMy41NnYtNS41N2MwLTEuMzMtLjAyLTMuMDQtMS44NS0zLjA0LTEuODUgMC0yLjE0IDEuNDUtMi4xNCAyLjk0djUuNjdIOS4zNVY5aDMuNDF2MS41NmguMDVjLjQ4LS45IDEuNjQtMS44NSAzLjM3LTEuODUgMy42IDAgNC4yNyAyLjM3IDQuMjcgNS40NnY2LjI4ek01LjM0IDcuNDNhMi4wNiAyLjA2IDAgMSAxIDAtNC4xMyAyLjA2IDIuMDYgMCAwIDEgMCA0LjEzek03LjEyIDIwLjQ1SDMuNTZWOWgzLjU2djExLjQ1eiIvPjwvc3ZnPg%3D%3D" alt="LinkedIn"></a>
  <a href="https://feuerschvenger.com/"><img src="https://img.shields.io/badge/Portfolio-feuerschvenger.com-c97608?style=flat-square&logo=googlechrome&logoColor=white" alt="Portfolio"></a>
</p>

<p align="center"><sub>Publicado bajo la <a href="LICENSE">licencia MIT</a>, con los recursos de terceros acreditados allí.</sub></p>
