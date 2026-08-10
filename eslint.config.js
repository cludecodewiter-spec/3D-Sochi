import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // __*.mjs are throwaway browser-driving harnesses, not shipped code
  { ignores: ['dist', 'node_modules', '__*.mjs', '__*.ts', 'public'] },
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
