import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkTool, type Violation } from '@/platform/conformance';

const toolsDir = join(import.meta.dirname, '..', 'app', 'tools');
const toolIds = readdirSync(toolsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

if (toolIds.length === 0) {
  describe('paved road', () => {
    it('no tools yet', () => {
      expect(toolIds).toEqual([]);
    });
  });
} else {
  describe('paved road: static conformance', () => {
    for (const id of toolIds) {
      it(id, async () => {
        const violations: Violation[] = await checkTool(join(toolsDir, id));
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      });
    }
  });
}
