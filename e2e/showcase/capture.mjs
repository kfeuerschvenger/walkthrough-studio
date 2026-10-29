// Captures the product screenshots and the animation used in the README.
//
// It builds a private copy of the app (see stack.mjs), loads the demo scene
// into it (see seed.mjs), drives it with a real browser and writes two files
// per still: the raw screenshot, and the same screenshot inside a browser
// frame. The hero slug records a video instead, which gif.mjs turns into a GIF
// and an MP4.
//
// Every shot shows the bundled demo house, on a throwaway data folder. The
// hero flow paints one wall and moves the clock, and all of it lands in that
// folder, which is deleted when the run ends. Nothing is ever confirmed in a
// dialog: a dialog that opens is dismissed and fails the shot.
//
// Usage, from e2e/:
//   node showcase/capture.mjs                    every still
//   SLUGS=texture-editor node showcase/capture.mjs
//   node showcase/capture.mjs hero               the video, for gif.mjs (a slug may also be an argument)

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { DEMO_HOUSE_URL, startStack } from './stack.mjs';
import { reseedScene, seedDemo } from './seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');

/** Raw and framed stills and the animation, which are committed. */
const OUT = process.env.SHOWCASE_OUT ? path.resolve(process.env.SHOWCASE_OUT) : path.join(REPO, 'docs', 'assets', 'screens');
/** The hero video and its palette, which are not committed. */
const WORK = path.join(here, 'out');

const VIEWPORT = { width: 1600, height: 1000 };
/** Raw shots are taken at twice the pixel density, for crisp text. */
const RAW_SCALE = 2;
/** The framed composite is rendered at this density. */
const FRAME_SCALE = Number(process.env.SHOWCASE_FRAME_SCALE ?? 1.25);

/** Centre of the editor's 3D view: the viewport minus the 340 px side panel. */
const EDITOR_CENTER = { x: 630, y: 500 };

/** Radians of look per pixel of pointer movement in the first-person controls. */
const LOOK_RADIANS_PER_PIXEL = 0.002;
const QUARTER_TURN_PIXELS = Math.round(Math.PI / 2 / LOOK_RADIANS_PER_PIXEL);

const log = (...parts) => console.log(...parts);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ---------------------------------------------------------------------- */
/* Page helpers                                                           */
/* ---------------------------------------------------------------------- */

/** Opens a context the way every shot needs it: light, a fixed locale and zone. */
const openContext = (browser, options = {}) =>
  browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: RAW_SCALE,
    colorScheme: 'light',
    locale: 'es-AR',
    timezoneId: 'UTC',
    ...options,
  });

/** Opens a page that fails its shot when a dialog opens, and never confirms one. */
const openPage = async context => {
  const page = await context.newPage();
  page.problems = [];
  page.on('dialog', dialog => {
    page.problems.push(`a dialog opened: "${dialog.message().slice(0, 60)}"`);
    dialog.dismiss().catch(() => {});
  });
  page.on('pageerror', error => page.problems.push(`page error: ${error.message.slice(0, 120)}`));
  return page;
};

/** Waits for the route to be in place and the house to have loaded and painted. */
const waitForScene = async page => {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => {
      const text = [...document.querySelectorAll('span')].find(node => /Cargando casa/.test(node.textContent ?? ''));
      return !text || !text.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.locator('canvas').first().waitFor();
};

/** Fails the shot when the page shows a notice, a load error, or a different house. */
const assertClean = async page => {
  if (page.problems.length > 0) throw new Error(page.problems[0]);
  const toasts = await page.locator('.toast').count();
  if (toasts > 0) throw new Error(`a notice is on screen (${toasts})`);
  if ((await page.locator('.scene-load-error').count()) > 0) throw new Error('the scene failed to load');

  const models = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(entry => new URL(entry.name).pathname)
      .filter(name => /\.(glb|gltf|fbx)$/i.test(name))
  );
  const unexpected = models.filter(name => name !== DEMO_HOUSE_URL);
  if (!models.includes(DEMO_HOUSE_URL) || unexpected.length > 0) {
    throw new Error(`the page did not load the demo house (models requested: ${models.join(', ') || 'none'})`);
  }
};

/**
 * Takes screenshots until two in a row are identical, so a shot is not taken
 * while the paints are still being applied. Scenes with moving stars never
 * settle, so they wait a fixed time instead.
 */
const settle = async (page, { animated = false } = {}) => {
  if (animated) {
    await page.waitForTimeout(2500);
    return;
  }
  let previous = await page.screenshot({ type: 'jpeg', quality: 60 });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(700);
    const current = await page.screenshot({ type: 'jpeg', quality: 60 });
    if (current.equals(previous)) return;
    previous = current;
  }
  throw new Error('the scene never settled');
};

/** Zooms and orbits the editor's camera with the controls a person would use. */
const frameEditor = async (page, { zoomSteps, orbit = [0, 0] }) => {
  await page.mouse.move(EDITOR_CENTER.x, EDITOR_CENTER.y);
  for (let step = 0; step < zoomSteps; step += 1) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(18);
  }
  if (orbit[0] !== 0 || orbit[1] !== 0) {
    await page.keyboard.down('Shift');
    await page.mouse.move(EDITOR_CENTER.x, EDITOR_CENTER.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(EDITOR_CENTER.x + orbit[0], EDITOR_CENTER.y + orbit[1], { steps: 14 });
    await page.mouse.up({ button: 'middle' });
    await page.keyboard.up('Shift');
  }
  await page.mouse.move(VIEWPORT.width - 20, VIEWPORT.height - 20);
  await page.waitForTimeout(600);
};

/**
 * Enters first-person mode and points the camera.
 *
 * Mouse look is relative, so the pitch is made deterministic by pushing it to
 * the upward limit first and then coming back down a known distance. `yaw` is
 * in quarter turns to the right of the direction the camera has right after
 * the lock, `pitch` in pixels below the horizon.
 */
const enterWalkthrough = async (page, { yaw, pitch }) => {
  await page.locator('.overlay').click();
  await page.locator('.overlay').waitFor({ state: 'detached' });
  let x = VIEWPORT.width / 2;
  let y = VIEWPORT.height / 2;
  const move = async (dx, dy) => {
    x += dx;
    y += dy;
    await page.mouse.move(x, y, { steps: 8 });
  };
  await move(0, -1600);
  await move(0, QUARTER_TURN_PIXELS + pitch);
  await move(Math.round(-yaw * QUARTER_TURN_PIXELS), 0);
  await page.waitForTimeout(500);
};

/** Presses the hour key until the clock reads `hour` (it moves by half hours). */
const advanceClock = async (page, from, to) => {
  const presses = Math.round((to - from) / 0.5);
  for (let press = 0; press < Math.abs(presses); press += 1) {
    await page.keyboard.press(presses > 0 ? 'BracketRight' : 'BracketLeft');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
};

/* ---------------------------------------------------------------------- */
/* The inventory                                                          */
/* ---------------------------------------------------------------------- */

const SHOTS = [
  {
    slug: 'walkthrough-day',
    title: 'Recorrido en primera persona',
    scene: { hour: 14 },
    run: async ({ page, web }) => {
      await page.goto(`${web}/walkthrough`);
      await waitForScene(page);
      await enterWalkthrough(page, { yaw: -1, pitch: 120 });
      await settle(page);
    },
  },
  {
    slug: 'walkthrough-dusk',
    title: 'Recorrido al atardecer',
    scene: { hour: 14 },
    animated: true,
    run: async ({ page, web }) => {
      await page.goto(`${web}/walkthrough`);
      await waitForScene(page);
      await enterWalkthrough(page, { yaw: -1, pitch: 120 });
      await advanceClock(page, 14, 18);
      await settle(page, { animated: true });
    },
  },
  {
    slug: 'texture-editor',
    title: 'Editor de texturas',
    scene: { hour: 16.5 },
    run: async ({ page, web }) => {
      await page.goto(`${web}/texture-tool`);
      await waitForScene(page);
      await frameEditor(page, { zoomSteps: 34, orbit: [150, -20] });
      await page.getByRole('button', { name: 'Face', exact: true }).click();
      await page.locator('.tt-tex-card[title="Yeso.jpg"]').click();
      await page.mouse.move(VIEWPORT.width - 20, VIEWPORT.height - 20);
      await settle(page);
    },
  },
  {
    slug: 'light-editor',
    title: 'Editor de luces',
    scene: { hour: 19.5 },
    animated: true,
    run: async ({ page, web }) => {
      await page.goto(`${web}/texture-tool`);
      await waitForScene(page);
      await frameEditor(page, { zoomSteps: 34, orbit: [150, -20] });
      await page.getByRole('button', { name: 'Iluminación', exact: true }).click();
      await page.locator('.tt-light-row').first().click();
      await settle(page, { animated: true });
    },
  },
];

/** Every slug that can be asked for: the stills and the hero video. */
const SLUGS = [...SHOTS.map(shot => shot.slug), 'hero'];

/** The slugs this run takes. The hero is only recorded when it is named. */
const selectSlugs = () => {
  const requested = [process.env.SLUGS ?? '', ...process.argv.slice(2)]
    .flatMap(list => list.split(','))
    .map(slug => slug.trim())
    .filter(Boolean);

  const unknown = requested.filter(slug => !SLUGS.includes(slug));
  if (unknown.length > 0) {
    throw new Error(`Unknown slug ${unknown.join(', ')}. Known slugs: ${SLUGS.join(', ')}`);
  }

  return requested.length > 0 ? requested : SHOTS.map(shot => shot.slug);
};

/* ---------------------------------------------------------------------- */
/* Stills                                                                 */
/* ---------------------------------------------------------------------- */

/** Puts a raw screenshot in the browser frame and returns the framed PNG. */
const frameShot = async (framePage, raw, { title, width }) => {
  await framePage.evaluate(shot => window.placeShot(shot), {
    src: `data:image/png;base64,${raw.toString('base64')}`,
    width,
    title,
  });
  return framePage.locator('#stage').screenshot({ type: 'png' });
};

/** Fails on a black or blank picture, which is what a canvas that did not render looks like. */
const assertNotBlank = async (framePage, raw) => {
  const { mean, deviation } = await framePage.evaluate(src => window.measureShot(src), `data:image/png;base64,${raw.toString('base64')}`);
  if (mean < 8 || deviation < 10) {
    throw new Error(`the picture looks blank (mean ${mean.toFixed(1)}, deviation ${deviation.toFixed(1)})`);
  }
};

const kilobytes = async file => `${Math.round((await stat(file)).size / 1024)} KB`;

const takeStill = async (shot, { browser, framePage, stack, textureIds }) => {
  // Every still starts from the same scene, whatever an earlier shot changed.
  await reseedScene(stack.api, textureIds, shot.scene);

  const context = await openContext(browser);
  try {
    const page = await openPage(context);
    await shot.run({ page, web: stack.web });
    await assertClean(page);

    const raw = await page.screenshot({ type: 'png' });
    await assertNotBlank(framePage, raw);
    const framed = await frameShot(framePage, raw, { title: shot.title, width: VIEWPORT.width });

    await writeFile(path.join(OUT, `${shot.slug}.raw.png`), raw);
    await writeFile(path.join(OUT, `${shot.slug}.png`), framed);
  } finally {
    await context.close();
    // The page saves the scene when it closes: let that write land before the next reset.
    await sleep(400);
  }
};

/* ---------------------------------------------------------------------- */
/* Hero                                                                   */
/* ---------------------------------------------------------------------- */

/** The wall the hero flow paints, and what it paints it with. */
const HERO_WALL_BODY = 'wall_v_0_1';
const HERO_TEXTURE = 'Ladrillo.jpg';
const HERO_START_HOUR = 12;
const HERO_END_HOUR = 22;

/** A dot that follows the pointer, since a recording does not show the system cursor. */
const CURSOR_SCRIPT = () => {
  window.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgb(249 154 28 / 0.9);border:3px solid #fff;box-shadow:0 2px 8px rgb(0 0 0 / 0.5);' +
      'pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px)';
    document.body.append(dot);
    window.addEventListener(
      'mousemove',
      event => {
        dot.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      },
      true
    );
    window.addEventListener('mousedown', () => (dot.style.scale = '0.8'), true);
    window.addEventListener('mouseup', () => (dot.style.scale = '1'), true);
  });
};

/** Moves the pointer along an eased path, with the events spread in time. */
const glide = async (page, from, to, { steps = 24, delay = 16 } = {}) => {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
    await page.waitForTimeout(delay);
  }
  return to;
};

/**
 * The hero runs in the full Chromium build in its new headless mode, not in the
 * headless shell that Playwright launches by default. The shell rasterizes in
 * software and renders animation at a fraction of the display rate, which the
 * video shows as stutter. The full build renders at the display rate.
 */
const launchHeroBrowser = () => chromium.launch({ channel: 'chromium' });

const recordHero = async ({ stack, textureIds }) => {
  const dir = path.join(WORK, 'video');
  await rm(dir, { recursive: true, force: true });

  // The wall starts unpainted, so the flow has something to paint.
  await reseedScene(stack.api, textureIds, { skipBodies: [HERO_WALL_BODY], hour: HERO_START_HOUR });

  const browser = await launchHeroBrowser();
  const context = await openContext(browser, { deviceScaleFactor: 1, recordVideo: { dir, size: VIEWPORT } });
  await context.addInitScript(CURSOR_SCRIPT);

  const page = await openPage(context);
  const recordingStarted = Date.now();

  try {
    await page.goto(`${stack.web}/texture-tool`);
    await waitForScene(page);
    await frameEditor(page, { zoomSteps: 34, orbit: [320, -20] });
    await settle(page);
    await assertClean(page);

    const card = page.locator(`.tt-tex-card[title="${HERO_TEXTURE}"]`);
    const slider = page.locator('.time-slider input[type="range"]');
    const cardBox = await card.boundingBox();
    const sliderBox = await slider.boundingBox();
    if (!cardBox || !sliderBox) throw new Error('the texture card or the time slider is not rendered');

    // The footage before this moment is the page loading, and gif.mjs cuts it.
    const startAt = (Date.now() - recordingStarted) / 1000 + 0.3;
    await page.waitForTimeout(500);

    let pointer = { x: VIEWPORT.width - 120, y: 640 };
    await page.mouse.move(pointer.x, pointer.y);

    // 1. Pick a texture.
    pointer = await glide(page, pointer, { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 }, { steps: 16 });
    await page.waitForTimeout(150);
    await card.click();
    await page.waitForTimeout(300);

    // 2. Paint the wall.
    pointer = await glide(page, pointer, HERO_WALL_POINT, { steps: 18 });
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(700);

    // 3. Move the clock from noon to night.
    const track = { left: sliderBox.x + 9, width: sliderBox.width - 18 };
    const thumbAt = hour => ({ x: track.left + (hour / 24) * track.width, y: sliderBox.y + sliderBox.height / 2 });
    pointer = await glide(page, pointer, thumbAt(HERO_START_HOUR), { steps: 14 });
    await page.waitForTimeout(120);
    await page.mouse.down();
    const sweep = 60;
    for (let step = 1; step <= sweep; step += 1) {
      const target = thumbAt(HERO_START_HOUR + ((HERO_END_HOUR - HERO_START_HOUR) * step) / sweep);
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(18);
    }
    await page.mouse.up();
    await page.waitForTimeout(900);
    const endAt = (Date.now() - recordingStarted) / 1000;

    await page.mouse.move(VIEWPORT.width - 20, VIEWPORT.height - 20);
    await page.waitForTimeout(200);
    if (page.problems.length > 0) throw new Error(page.problems[0]);

    await context.close();
    const video = await page.video().path();
    await copyFile(video, path.join(WORK, 'hero.webm'));
    await writeFile(path.join(WORK, 'hero.json'), JSON.stringify({ start: Number(startAt.toFixed(2)), end: Number(endAt.toFixed(2)) }));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
};

/** Where the hero flow clicks to paint the wall, in the 3D view. */
const HERO_WALL_POINT = { x: 520, y: 630 };

/* ---------------------------------------------------------------------- */
/* Main                                                                   */
/* ---------------------------------------------------------------------- */

const main = async () => {
  const slugs = selectSlugs();
  const stills = SHOTS.filter(shot => slugs.includes(shot.slug));

  await mkdir(WORK, { recursive: true });
  await mkdir(OUT, { recursive: true });
  await readFile(path.join(here, 'frame.html'));

  log('Building the demo app on a throwaway data folder...');
  const stack = await startStack();
  let browser;
  const failures = [];
  const report = (slug, ok, detail) => {
    log(`${ok ? 'OK  ' : 'FAIL'} ${slug}${detail ? `  ${detail}` : ''}`);
    if (!ok) failures.push(slug);
  };

  try {
    const { ids: textureIds } = await seedDemo(stack.api);

    browser = await chromium.launch({ channel: 'chromium' });
    const frameContext = await browser.newContext({ viewport: { width: 2000, height: 1500 }, deviceScaleFactor: FRAME_SCALE });
    const framePage = await frameContext.newPage();
    await framePage.goto(pathToFileURL(path.join(here, 'frame.html')).href);

    for (const shot of stills) {
      try {
        await takeStill(shot, { browser, framePage, stack, textureIds });
        report(shot.slug, true, await kilobytes(path.join(OUT, `${shot.slug}.png`)));
      } catch (error) {
        report(shot.slug, false, error.message.split('\n')[0]);
      }
    }

    if (slugs.includes('hero')) {
      try {
        await recordHero({ stack, textureIds });
        report('hero', true, 'recorded, run gif.mjs to convert it');
      } catch (error) {
        report('hero', false, error.message.split('\n')[0]);
      }
    }
  } catch (error) {
    report('setup', false, error.message.split('\n')[0]);
  } finally {
    await browser?.close().catch(() => {});
    await stack.stop();
  }

  if (failures.length > 0) {
    log(`\n${failures.length} failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  log('\nAll shots captured.');
};

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
