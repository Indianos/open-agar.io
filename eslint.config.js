import js from '@eslint/js';

export default [
  { ignores: ['client/dist/**', 'coverage/**', 'db/data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module' },
  },
  {
    files: ['client/src/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        WebSocket: 'readonly',
        fetch: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        ResizeObserver: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        devicePixelRatio: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
