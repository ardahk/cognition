import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { listAudit, writeAudit } from '@/platform/audit';

const base = {
  module: 'test',
  action: 'test.audit',
  actorId: 't',
  actorEmail: 't@fernpay.test',
  actorName: 'T',
  actorRoles: ['engineer'],
};

describe('append-only audit', () => {
  beforeEach(async () => {
    await sql`TRUNCATE audit_events`;
  });

  it('blocks UPDATE and DELETE', async () => {
    await writeAudit({ ...base, status: 'attempted', attemptId: crypto.randomUUID() });
    await expect(sql`UPDATE audit_events SET error = 'x'`).rejects.toThrow(
      'audit_events is append-only',
    );
    await expect(sql`DELETE FROM audit_events`).rejects.toThrow(
      'audit_events is append-only',
    );
  });

  it('listAudit unresolved returns attempted rows with no outcome', async () => {
    const openAttempt = crypto.randomUUID();
    const doneAttempt = crypto.randomUUID();
    await writeAudit({ ...base, status: 'attempted', attemptId: openAttempt });
    await writeAudit({ ...base, status: 'attempted', attemptId: doneAttempt });
    await writeAudit({ ...base, status: 'succeeded', attemptId: doneAttempt });
    const rows = await listAudit({ unresolved: true });
    expect(rows.map((r) => r.attemptId)).toEqual([openAttempt]);
  });
});
