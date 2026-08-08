import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The SDK is browser code: window, CustomEvent and postMessage have to exist for the
    // transport and discovery tests to mean anything.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
