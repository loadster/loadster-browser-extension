import js from "@eslint/js";
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'bk/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      semi: 'error',
      'object-curly-spacing': ['error', 'always'],
      'no-unused-vars': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn'
    }
  }
];
