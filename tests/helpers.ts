import { vi } from 'vitest';
import { handleMockVendorRequest } from '@/mock-vendors/router';
import { PERSONAS, type PersonaId } from '@/platform/auth/personas';
import { SESSION_COOKIE, signSession } from '@/platform/auth/session';

function jar() {
  return (globalThis as unknown as { __testCookies: Map<string, string> }).__testCookies;
}

export function signInAs(id: PersonaId) {
  jar().set(SESSION_COOKIE, signSession(PERSONAS[id]));
}

export function signOut() {
  jar().clear();
}

export function inProcessFetch(input: string | URL | Request, init?: RequestInit) {
  return handleMockVendorRequest(new Request(input, init));
}

export function useInProcessVendors() {
  vi.stubGlobal('fetch', inProcessFetch);
}
