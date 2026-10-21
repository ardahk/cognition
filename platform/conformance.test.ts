import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkTool } from './conformance';

const TMP = join(import.meta.dirname, '..', '.tmp', 'conformance');
const TEMPLATE = join(import.meta.dirname, '..', 'templates', 'tool');

function scaffold(id: string) {
  const dir = join(TMP, id);
  mkdirSync(dir, { recursive: true });
  for (const f of ['manifest.ts', 'access.ts', 'page.tsx', 'error.tsx', 'tool.test.ts']) {
    writeFileSync(
      join(dir, f),
      readFileSync(join(TEMPLATE, f), 'utf8')
        .replaceAll('__TOOL_ID__', id)
        .replaceAll('__TOOL_NAME__', id),
    );
  }
  return dir;
}

function write(dir: string, file: string, content: string) {
  writeFileSync(join(dir, file), content);
}

function patch(dir: string, file: string, from: string, to: string) {
  const p = join(dir, file);
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, to));
}

// A real description and a real test remove the template's starter violations.
function makeClean(dir: string) {
  patch(dir, 'manifest.ts', 'TODO: one sentence on what this tool does and who uses it.', 'A real description.');
  write(dir, 'tool.test.ts', "import { describe, expect, it } from 'vitest';\n\ndescribe('t', () => {\n  it('works', () => { expect(1).toBe(1); });\n});\n");
}

const rules = (dir: string) => checkTool(dir).then((v) => v.map((x) => x.rule).sort());

describe('checkTool', () => {
  // checkTool imports tool files, and a re-import in the same process can serve
  // a stale module — so the "after fix" case uses a fresh scaffold, not a rewrite.
  it('template → exactly TESTS_TODO + DESCRIPTION_TODO; clean after real test + description', async () => {
    const dirty = scaffold('sample-tool');
    expect(await rules(dirty)).toEqual(['DESCRIPTION_TODO', 'TESTS_TODO']);
    const clean = scaffold('sample-tool-2');
    makeClean(clean);
    expect(await checkTool(clean)).toEqual([]);
  });

  it('flags risk mismatch: payments.refund is critical, not sensitive', async () => {
    const dir = scaffold('risk-tool');
    patch(dir, 'manifest.ts', 'connectors: {}', "connectors: { payments: ['refund'] }");
    patch(dir, 'manifest.ts', "risk: 'low'", "risk: 'sensitive'");
    makeClean(dir);
    expect(await rules(dir)).toEqual(['RISK_MISMATCH']);
  });

  it('flags a forbidden platform import', async () => {
    const dir = scaffold('import-tool');
    write(dir, 'probe.ts', "import { createConnectors } from '@/platform/connectors';\n\nexport const x = createConnectors;\n");
    makeClean(dir);
    expect(await rules(dir)).toEqual(['FORBIDDEN_IMPORT']);
  });

  it('flags a page that skips moduleContext', async () => {
    const dir = scaffold('page-tool');
    write(dir, 'page.tsx', 'export default function Page() {\n  return <div />;\n}\n');
    makeClean(dir);
    expect(await rules(dir)).toEqual(['PAGE_WITHOUT_CONTEXT']);
  });

  it('flags an inline use server directive outside actions.ts', async () => {
    const dir = scaffold('action-tool');
    write(
      dir,
      'page.tsx',
      "import { moduleContext } from '@/platform/module';\nimport manifest from './manifest';\n\nexport default async function Page() {\n  await moduleContext(manifest);\n  async function act() {\n    'use server';\n    return null;\n  }\n  return <div />;\n}\n",
    );
    makeClean(dir);
    expect(await rules(dir)).toEqual(['ACTION_UNWRAPPED']);
  });

  it('flags a forbidden dynamic import', async () => {
    const dir = scaffold('dynamic-tool');
    write(
      dir,
      'sneak.ts',
      "export async function db() {\n  return await import('@/platform/db/client');\n}\n",
    );
    makeClean(dir);
    expect(await rules(dir)).toEqual(['FORBIDDEN_IMPORT']);
  });

  it('an actions.ts with type annotations imports cleanly (no stale-cache false positive)', async () => {
    const dir = scaffold('typed-tool');
    write(
      dir,
      'actions.ts',
      `'use server';

import { z } from 'zod';
import { defineAction } from '@/platform/module';
import manifest from './manifest';

const target = (i: { id: string }): { type: string; id: string } => ({ type: 'thing', id: i.id });

export const ping = defineAction(manifest, {
  name: 'ping',
  permission: 'typed-tool.view',
  input: z.object({ id: z.string() }),
  target,
  handler: async () => ({ ok: true }),
});
`,
    );
    makeClean(dir);
    expect(await checkTool(dir)).toEqual([]);
  });
});
