import assert from 'node:assert/strict';
import test from 'node:test';
import { syncLiffProfileIdentity } from '../line-liff-profile-sync.js';

test('an authenticated LIFF session establishes canonical app identity from a valid profile', async () => {
  let applied = null;
  const result = await syncLiffProfileIdentity({
    isLoggedIn: () => true,
    getProfile: async () => ({ userId: 'U-not-logged', displayName: 'Customer' }),
    applyIdentity: (identity) => {
      applied = identity;
      return true;
    }
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(applied, { lineUserId: 'U-not-logged', displayName: 'Customer' });
});

test('profile errors, missing IDs, and failed canonical assignment remain fail-closed', async () => {
  const throwing = await syncLiffProfileIdentity({
    isLoggedIn: () => true,
    getProfile: async () => { throw new Error('unavailable'); },
    applyIdentity: () => true
  });
  assert.deepEqual(throwing, { ok: false, reason: 'LIFF_PROFILE_GET_THROW' });

  const missingId = await syncLiffProfileIdentity({
    isLoggedIn: () => true,
    getProfile: async () => ({ displayName: 'Customer' }),
    applyIdentity: () => true
  });
  assert.deepEqual(missingId, { ok: false, reason: 'LIFF_PROFILE_MISSING_USER_ID' });

  const notApplied = await syncLiffProfileIdentity({
    isLoggedIn: () => true,
    getProfile: async () => ({ userId: 'U-not-logged' }),
    applyIdentity: () => false
  });
  assert.deepEqual(notApplied, { ok: false, reason: 'LIFF_PROFILE_STATE_ID_MISSING' });
});

test('an unavailable LIFF session does not fabricate an identity', async () => {
  const result = await syncLiffProfileIdentity({
    isLoggedIn: () => false,
    getProfile: async () => ({ userId: 'U-not-used' }),
    applyIdentity: () => true
  });
  assert.deepEqual(result, { ok: false, reason: 'LIFF_PROFILE_SESSION_UNAVAILABLE' });
});
