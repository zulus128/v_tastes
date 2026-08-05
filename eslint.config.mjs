import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/lib/**', '**/node_modules/**', '.firebase-data/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/services/backend/**'],
          message: 'Mobile code must use @tastes/contracts and @tastes/firebase-client instead of backend internals.'
        }]
      }]
    }
  },
  {
    files: ['services/backend/functions/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@tastes/firebase-client',
          message: 'Backend code must not depend on the Firebase client package.'
        }],
        patterns: [{
          group: ['**/apps/mobile/**'],
          message: 'Backend code must not import mobile application internals.'
        }]
      }]
    }
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'Domain contracts must stay runtime-agnostic.' },
          { name: 'react-native', message: 'Domain contracts must stay runtime-agnostic.' },
          { name: 'firebase', message: 'Domain contracts must stay independent of Firebase.' },
          { name: '@tastes/firebase-client', message: 'Contracts must not depend on client infrastructure.' }
        ],
        patterns: [
          { group: ['firebase/**'], message: 'Domain contracts must stay independent of Firebase.' },
          { group: ['**/apps/mobile/**', '**/services/backend/**'], message: 'Contracts must not import application internals.' }
        ]
      }]
    }
  }
);
