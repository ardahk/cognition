import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { manifestSchema, type ModuleAccess } from './define';
import { riskOf } from './connectors/scopes';
import { ROLES } from './auth/roles';

export type Violation = { rule: string; file: string; message: string };

const ACTION_META = Symbol.for('toolyard.action');
const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const USE_SERVER_RE = /(['"])use server\1/;
const TEST_FILE_RE = /\.test\.tsx?$/;
const REAL_TEST_RE = /\b(?:it|test)\s*\(/;

// Import with an mtime query so a file rewritten between two checkTool calls
// is re-evaluated instead of served from the module cache.
function freshImport(file: string) {
  return import(`${file}?v=${statSync(file).mtimeMs}`);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function importViolation(spec: string, file: string, dir: string, isTest: boolean) {
  if (spec.startsWith('.')) {
    const resolved = resolve(dirname(file), spec);
    if (resolved !== dir && !resolved.startsWith(dir + sep)) {
      return `relative import "${spec}" escapes the tool folder`;
    }
    return null;
  }
  if (spec === 'postgres') return 'tools use ctx.db and ctx.connectors, never a raw DB client';
  if (!spec.startsWith('@/')) return null;
  if (spec === '@/platform/define' || spec === '@/platform/module') return null;
  if (spec === '@/platform/ui' || spec.startsWith('@/platform/ui/')) return null;
  if (spec.startsWith('@/components/ui/') || spec === '@/lib/utils') return null;
  if (spec === '@/tests/helpers' && isTest) return null;
  return `import "${spec}" is not on the tool allowlist`;
}

export async function checkTool(dir: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const id = basename(dir);
  const fail = (rule: string, file: string, message: string) =>
    violations.push({ rule, file: relative(dir, file) || file, message });

  const files = [...walk(dir)].filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const actionsFile = join(dir, 'actions.ts');

  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (/^route\.tsx?$/.test(basename(f))) {
      fail('ROUTE_HANDLER', f, 'tools have no route handlers — use defineAction');
    }
    if (f !== actionsFile && USE_SERVER_RE.test(src)) {
      fail(
        'ACTION_UNWRAPPED',
        f,
        'server actions live in actions.ts and use defineAction',
      );
    }
    if (basename(f) === 'page.tsx' && !src.includes('moduleContext(')) {
      fail('PAGE_WITHOUT_CONTEXT', f, 'page.tsx must read via moduleContext(manifest)');
    }
    const isTest = TEST_FILE_RE.test(f);
    for (const m of src.matchAll(IMPORT_RE)) {
      const problem = importViolation(m[1], f, dir, isTest);
      if (problem) fail('FORBIDDEN_IMPORT', f, problem);
    }
    for (const m of src.matchAll(DYNAMIC_IMPORT_RE)) {
      const problem = importViolation(m[1], f, dir, isTest);
      if (problem) fail('FORBIDDEN_IMPORT', f, `dynamic ${problem}`);
    }
  }

  const manifestFile = join(dir, 'manifest.ts');
  let manifest: z.output<typeof manifestSchema> | null = null;
  if (!existsSync(manifestFile)) {
    fail('MANIFEST_INVALID', manifestFile, 'manifest.ts is missing');
  } else {
    let raw: unknown;
    try {
      raw = (await freshImport(manifestFile)).default;
    } catch (e) {
      fail('MANIFEST_INVALID', manifestFile, e instanceof Error ? e.message : String(e));
    }
    if (raw !== undefined) {
      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success) {
        fail('MANIFEST_INVALID', manifestFile, z.prettifyError(parsed.error));
      } else {
        manifest = parsed.data;
        if (manifest.id !== id) {
          fail('MANIFEST_INVALID', manifestFile, `manifest id "${manifest.id}" != folder "${id}"`);
        }
        if (manifest.description.includes('TODO')) {
          fail('DESCRIPTION_TODO', manifestFile, 'description still contains TODO');
        }
        const expected = riskOf(manifest.connectors);
        if (manifest.risk !== expected) {
          fail('RISK_MISMATCH', manifestFile, `risk "${manifest.risk}" != "${expected}" (highest scope tier)`);
        }
      }
    }
  }

  const accessFile = join(dir, 'access.ts');
  if (manifest && existsSync(accessFile)) {
    let access: ModuleAccess | undefined;
    try {
      access = (await freshImport(accessFile)).default;
    } catch (e) {
      fail('ACCESS_INVALID', accessFile, e instanceof Error ? e.message : String(e));
    }
    if (access) {
      if (access.module !== manifest.id) {
        fail('ACCESS_INVALID', accessFile, `access.module "${access.module}" != "${manifest.id}"`);
      }
      const granted = new Set<string>();
      for (const [role, perms] of Object.entries(access.grants)) {
        if (!(ROLES as readonly string[]).includes(role)) {
          fail('ACCESS_INVALID', accessFile, `unknown role "${role}"`);
        }
        for (const p of perms as string[]) {
          granted.add(p);
          if (!manifest.permissions.includes(p)) {
            fail('ACCESS_INVALID', accessFile, `permission "${p}" is not declared in the manifest`);
          }
        }
      }
      if (!granted.has(manifest.viewPermission)) {
        fail('ACCESS_INVALID', accessFile, `viewPermission "${manifest.viewPermission}" is granted to no role`);
      }
    }
  }

  if (manifest && existsSync(actionsFile)) {
    const src = readFileSync(actionsFile, 'utf8');
    if (!src.startsWith("'use server'") && !src.startsWith('"use server"')) {
      fail('ACTION_UNWRAPPED', actionsFile, "actions.ts must start with 'use server'");
    }
    let exports: Record<string, unknown> = {};
    try {
      exports = await freshImport(actionsFile);
    } catch (e) {
      fail('ACTION_UNWRAPPED', actionsFile, e instanceof Error ? e.message : String(e));
    }
    for (const [name, value] of Object.entries(exports)) {
      const meta = (value as Record<symbol, { module: ModuleManifestLike; spec: { permission: string } } | undefined>)?.[
        ACTION_META
      ];
      if (!meta) {
        fail('ACTION_UNWRAPPED', actionsFile, `export "${name}" was not built by defineAction`);
        continue;
      }
      if (meta.module.id !== manifest.id) {
        fail('ACTION_UNWRAPPED', actionsFile, `export "${name}" belongs to module "${meta.module.id}"`);
      }
      if (!manifest.permissions.includes(meta.spec.permission)) {
        fail('ACTION_UNWRAPPED', actionsFile, `export "${name}" uses undeclared permission "${meta.spec.permission}"`);
      }
    }
  }

  const schemaFile = join(dir, 'schema.ts');
  if (existsSync(schemaFile)) {
    const prefix = `${id.replaceAll('-', '_')}_`;
    for (const m of readFileSync(schemaFile, 'utf8').matchAll(/pgTable\(\s*['"]([^'"]+)['"]/g)) {
      if (!m[1].startsWith(prefix)) {
        fail('TABLE_PREFIX', schemaFile, `table "${m[1]}" must start with "${prefix}"`);
      }
    }
  }

  const testFiles = files.filter((f) => TEST_FILE_RE.test(f));
  if (testFiles.length === 0) {
    fail('TESTS_MISSING', join(dir, 'x.test.ts'), 'no *.test.ts(x) file in this tool');
  } else if (!testFiles.some((f) => REAL_TEST_RE.test(readFileSync(f, 'utf8')))) {
    fail('TESTS_TODO', testFiles[0], 'test files contain only .todo tests');
  }

  return violations;
}

type ModuleManifestLike = { id: string };
