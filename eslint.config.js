import js from "@eslint/js";
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'bk/**', 'src/generated/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['vite.config.js', 'scripts/**'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      }
    },
    rules: {
      'generator-star-spacing': 'off',
      'no-async-promise-executor': ['warn'],
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'object-curly-spacing': ['warn', 'always'],
      semi: [2, 'always'],

    }
  }
];
