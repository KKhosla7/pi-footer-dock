import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['node_modules/**', '.task_logs/**', 'docs/preview/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-param-reassign': 'error',
      eqeqeq: ['error', 'always'],
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 65, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 220, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Every message goes through say() (src/notify.ts): cleaned, bounded and never throwing.
    files: ['src/**/*.ts'],
    ignores: ['src/notify.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='notify']",
          message: 'Show messages with say() from src/notify.ts, not ui.notify().',
        },
      ],
    },
  },
  {
    // The picture generator is a development tool written as one script, not product code.
    files: ['scripts/screenshots.ts'],
    rules: { 'max-lines': 'off', 'max-params': 'off' },
  },
  prettier,
);
