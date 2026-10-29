import { RectAreaLightUniformsLib } from 'three-stdlib';

/**
 * One-time renderer setup. Import it for its side effects from every
 * module that mounts a canvas (the two interactive routes); it runs once,
 * on first import, and lives in the same lazy chunk as three.js.
 */

// `RectAreaLight` needs its LUT uniforms initialized once before any
// instance hits the renderer. Without this, every area light renders
// black, and no error is logged, so it is easy to miss.
RectAreaLightUniformsLib.init();

/** Text of the deprecation warning `@react-three/fiber` triggers by itself. */
const THREE_CLOCK_WARNING = 'THREE.Clock: This module has been deprecated';

// `@react-three/fiber` instantiates `THREE.Clock` in its internal loop, which
// makes three.js log a deprecation warning on every dev page load. Our code
// cannot avoid it, and there is no opt-out until r3f moves to `THREE.Timer`.
// The filter drops only that one message, only in development, so a
// production console keeps every warning. Remove it when r3f migrates.
if (import.meta.env.DEV) {
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes(THREE_CLOCK_WARNING)) return;
    originalWarn(...args);
  };
}
