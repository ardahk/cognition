import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '../env';
import { permissionsFor } from '../access';
import { rolesForGroups } from './roles';
import { SESSION_COOKIE } from './cookie';

export { SESSION_COOKIE };
const MAX_AGE_MS = 12 * 3600 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  title: string;
  groups: readonly string[];
};

export function signSession(
  user: SessionUser,
  secret = env.SESSION_SECRET,
  now = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({ u: user, iat: now })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string,
  secret = env.SESSION_SECRET,
  now = Date.now(),
): SessionUser | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { u, iat } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!u || typeof iat !== 'number' || now - iat > MAX_AGE_MS || iat - now > 60_000) {
      return null;
    }
    return u as SessionUser;
  } catch {
    return null;
  }
}

export type Session = {
  user: SessionUser;
  roles: ReturnType<typeof rolesForGroups>;
  permissions: ReadonlySet<string>;
};

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = verifySession(token);
  if (!user) return null;
  const roles = rolesForGroups(user.groups);
  return { user, roles, permissions: permissionsFor(roles) };
}
