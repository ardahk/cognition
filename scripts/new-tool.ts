import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [id, name] = process.argv.slice(2);

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('usage: npm run tool:new -- <id> "<Name>"   (id: /^[a-z][a-z0-9-]*$/)');
  process.exit(1);
}
if (!name) {
  console.error('usage: npm run tool:new -- <id> "<Name>"');
  process.exit(1);
}

const root = new URL('..', import.meta.url).pathname;
const templateDir = join(root, 'templates/tool');
const toolDir = join(root, 'app/tools', id);

if (existsSync(toolDir)) {
  console.error(`Tool already exists: ${toolDir}`);
  process.exit(1);
}

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else {
      const out = readFileSync(s, 'utf8')
        .replaceAll('__TOOL_ID__', id)
        .replaceAll('__TOOL_NAME__', name);
      writeFileSync(d, out);
    }
  }
}

copyDir(templateDir, toolDir);
execFileSync('node', [join(root, 'scripts/gen-registry.mjs')], { stdio: 'inherit' });

console.log(`
Created app/tools/${id}/

Next steps:
  1. Edit app/tools/${id}/manifest.ts — description, owner, connectors, permissions, nav.
  2. Edit app/tools/${id}/access.ts — grant least-privilege roles.
  3. Build the page and actions; replace it.todo in tool.test.ts with real tests.
  4. npm run check, then npm run dev and sign in as a persona that can see it.
`);
