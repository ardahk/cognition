import { vi } from 'vitest';
import { handleMockVendorRequest } from '@/mock-vendors/router';
import { PERSONAS, type PersonaId } from '@/platform/auth/personas';
import { SESSION_COOKIE, getSession, signSession } from '@/platform/auth/session';
import { decideApproval } from '@/platform/approvals/service';

function jar() {
  return (globalThis as unknown as { __testCookies: Map<string, string> }).__testCookies;
}

export function signInAs(id: PersonaId) {
  jar().set(SESSION_COOKIE, signSession(PERSONAS[id]));
}

export function signOut() {
  jar().clear();
}

export async function decideAs(
  id: PersonaId,
  approvalId: string,
  decision: 'approve' | 'reject',
  note?: string,
) {
  signInAs(id);
  const session = await getSession();
  if (!session) throw new Error(`no session for ${id}`);
  return decideApproval(session, { id: approvalId, decision, note });
}

export function inProcessFetch(input: string | URL | Request, init?: RequestInit) {
  return handleMockVendorRequest(new Request(input, init));
}

export function useInProcessVendors() {
  vi.stubGlobal('fetch', inProcessFetch);
}
