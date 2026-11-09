import js from '@eslint/js';
import tseslint, { type FlatConfig } from 'typescript-eslint';

const config: FlatConfig.Config[] = [
  { ignores: ['build/**', 'client/dist/**', 'coverage/**', 'db/data/**'] },
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended,
  {
    files: ['client/src/**/*.ts'],
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

export default config;
