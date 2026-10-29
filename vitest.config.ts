import { defineConfig } from 'vitest/config';

/**
 * Vitest config, kept apart from `vite.config.ts` so the dev proxy and
 * the React plugin never load for tests. Everything runs in the Node
 * environment: the tested frontend modules are pure three.js math, and
 * the server tests drive Express through supertest.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/features/painting/floodFill.ts',
        'src/features/lighting/sun.ts',
        'src/features/house/materialConverter.ts',
        'src/features/house/houseConfig.ts',
        'src/features/house/framing.ts',
        'src/features/house/materialPatch.ts',
        'src/features/house/modelUnits.ts',
        'src/features/painting/faceManager.ts',
        'src/features/painting/latestWins.ts',
        'src/features/painting/paintApply.ts',
        'src/features/painting/paintOps.ts',
        'src/features/lighting/lightListOps.ts',
        'src/features/lighting/nightness.ts',
        'src/features/lighting/userLightTypes.ts',
        'src/features/notifications/toastState.ts',
        'src/features/scene/scalePatcher.ts',
        'server/**/*.ts',
      ],
      exclude: ['server/__tests__/**', 'server/server.ts', 'server/types.ts'],
    },
  },
});
