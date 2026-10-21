import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import { signSession, verifySession } from './session';

const secret = 'test-secret-key-at-least-32-chars!!!';

describe('session', () => {
  it('sign/verify round trip', () => {
    const token = signSession(PERSONAS.alex, secret);
    expect(verifySession(token, secret)).toEqual(PERSONAS.alex);
  });

  it('rejects a tampered payload', () => {
    const token = signSession(PERSONAS.alex, secret);
    const [payload, sig] = token.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), u: PERSONAS.taylor }),
    ).toString('base64url');
    expect(verifySession(`${tampered}.${sig}`, secret)).toBeNull();
  });

  it('rejects the wrong secret', () => {
    const token = signSession(PERSONAS.alex, secret);
    expect(verifySession(token, 'a-different-secret-at-least-32-chars!')).toBeNull();
  });

  it('rejects a token older than 12h', () => {
    const now = Date.now();
    const token = signSession(PERSONAS.alex, secret, now - 13 * 3600 * 1000);
    expect(verifySession(token, secret, now)).toBeNull();
  });
});
