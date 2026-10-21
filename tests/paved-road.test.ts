import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkTool, type Violation } from '@/platform/conformance';
import { moduleActions } from '@/platform/actions.generated';
import { permissionsFor } from '@/platform/access';
import { PERSONAS, type PersonaId } from '@/platform/auth/personas';
import { rolesForGroups } from '@/platform/auth/roles';
import { signInAs, signOut } from '@/tests/helpers';

const ACTION_META = Symbol.for('toolyard.action');
const toolsDir = join(import.meta.dirname, '..', 'app', 'tools');
const toolIds = readdirSync(toolsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

type ActionMeta = { name: string; spec: { permission: string } };

function personaLacking(permission: string): PersonaId | undefined {
  return (Object.keys(PERSONAS) as PersonaId[]).find(
    (p) => !permissionsFor(rolesForGroups(PERSONAS[p].groups)).has(permission),
  );
}

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

  describe('paved road: actions enforce auth', () => {
    for (const reg of moduleActions) {
      for (const value of Object.values(reg.actions)) {
        const meta = (value as Record<symbol, ActionMeta | undefined>)[ACTION_META];
        if (!meta) continue;
        const action = value as (raw: unknown) => Promise<unknown>;
        it(`${reg.module}.${meta.name} → UNAUTHENTICATED when signed out`, async () => {
          signOut();
          await expect(action({})).resolves.toMatchObject({
            ok: false,
            error: 'UNAUTHENTICATED',
          });
        });
        it(`${reg.module}.${meta.name} → FORBIDDEN without ${meta.spec.permission}`, async () => {
          const persona = personaLacking(meta.spec.permission);
          expect(persona, `no persona lacks ${meta.spec.permission}`).toBeTruthy();
          signInAs(persona!);
          await expect(action({})).resolves.toMatchObject({ ok: false, error: 'FORBIDDEN' });
        });
      }
    }
  });
}
