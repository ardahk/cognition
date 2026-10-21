'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '../env';
import { PERSONAS, type PersonaId } from './personas';
import { SESSION_COOKIE, signSession } from './session';

function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function signInAs(personaId: PersonaId, next?: string) {
  if (env.AUTH_MODE !== 'mock' || process.env.NODE_ENV === 'production') {
    throw new Error('Mock sign-in is disabled');
  }
  if (!Object.hasOwn(PERSONAS, personaId)) throw new Error(`Unknown persona ${personaId}`);
  const persona = PERSONAS[personaId];
  const jar = await cookies();
  const secure = process.env.NODE_ENV === ('production' as string);
  jar.set(SESSION_COOKIE, signSession(persona), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 12 * 3600,
  });
  redirect(safeNext(next));
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
