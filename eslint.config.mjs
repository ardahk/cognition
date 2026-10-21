import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".tmp/**",
    "templates/**",
  ]),
  {
    files: ['app/tools/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'postgres', message: 'Tools use ctx.db and ctx.connectors, never a raw DB client.' }],
        patterns: [
          { group: ['@/platform/*', '!@/platform/define', '!@/platform/module', '!@/platform/ui', '!@/platform/ui/*'], message: 'Tools may only import @/platform/define, @/platform/module and @/platform/ui.' },
          { group: ['@/mock-vendors', '@/mock-vendors/*'], message: 'Vendors are external services: use ctx.connectors.' },
          { group: ['@/app/*'], message: 'Use relative imports inside a tool; never import another tool.' },
        ],
      }],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use ctx.connectors.' }],
      'no-restricted-syntax': ['error', { selector: "MemberExpression[object.name='process'][property.name='env']", message: 'Tools must not read environment variables.' }],
    },
  },
]);

export default eslintConfig;
