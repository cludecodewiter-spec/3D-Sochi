import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // engine/ and systems/ must stay DOM-free (DESIGN_v12 §9.5)
    files: ['src/engine/**/*.ts', 'src/systems/**/*.ts', 'src/content/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        'document', 'window', 'localStorage', 'navigator', 'alert',
      ],
    },
  },
)
