#!/usr/bin/env node
/**
 * ==============================================================================
 * LPU Lost & Found Property Recovery Platform
 * Automated Authentication & Role Verification Smoke Test
 * ==============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:8000/api/v1';

async function post(endpoint, body, headers = {}) {
  const res = await fetch(`${BASE_URL}/${endpoint.replace(/^\/+/, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

async function get(endpoint, headers = {}) {
  const res = await fetch(`${BASE_URL}/${endpoint.replace(/^\/+/, '')}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

async function runAuthTests() {
  console.log('\n================================================================');
  console.log('🔐 Running Comprehensive Authentication & Role-Based Access Tests');
  console.log(`🎯 API Target: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function assertCase(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name} ->`, err.message);
      failed++;
    }
  }

  // 1. Valid Student Login with Registration Number
  await assertCase('1. Student login via canonical Registration Number (12108801)', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: '12108801',
      password: 'DemoStudent2026!',
    });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.data.user.role !== 'STUDENT_STAFF') throw new Error(`Unexpected role: ${res.data.data.user.role}`);
    if (res.data.data.user.registrationNumber !== '12108801') throw new Error(`Wrong reg: ${res.data.data.user.registrationNumber}`);
  });

  // 2. Student Login with legacy alias
  await assertCase('2. Student login via alias Registration Number (12108001)', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: '12108001',
      password: 'DemoStudent2026!',
    });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.data.user.role !== 'STUDENT_STAFF') throw new Error(`Unexpected role: ${res.data.data.user.role}`);
  });

  // 3. Valid Security Officer Login
  let securityToken = '';
  await assertCase('3. Security Officer login via ID (LPU-SEC-001)', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: 'LPU-SEC-001',
      password: 'DemoSecurity2026!',
    });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.data.user.role !== 'SECURITY_PERSONNEL') throw new Error(`Unexpected role: ${res.data.data.user.role}`);
    securityToken = res.data.data.token;
  });

  // 4. Security Officer Login with alias
  await assertCase('4. Security Officer login via alias (SEC8001)', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: 'SEC8001',
      password: 'DemoSecurity2026!',
    });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.data.user.role !== 'SECURITY_PERSONNEL') throw new Error(`Unexpected role: ${res.data.data.user.role}`);
  });

  // 5. Valid Administrator Login
  let adminToken = '';
  await assertCase('5. Administrator login via ID (LPU-ADM-001)', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: 'LPU-ADM-001',
      password: 'DemoAdmin2026!',
    });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.data.user.role !== 'CAMPUS_ADMIN') throw new Error(`Unexpected role: ${res.data.data.user.role}`);
    adminToken = res.data.data.token;
  });

  // 6. Administrator Login with alias
  await assertCase('6. Administrator login via alias (ADM9001)', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: 'ADM9001',
      password: 'DemoAdmin2026!',
    });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.data.user.role !== 'CAMPUS_ADMIN') throw new Error(`Unexpected role: ${res.data.data.user.role}`);
  });

  // 7. Alternative request field names
  await assertCase('7. Flexible field names (registration_number, username, regNo)', async () => {
    const r1 = await post('auth/login', { registration_number: '12108801', password: 'DemoStudent2026!' });
    if (r1.status !== 200) throw new Error(`registration_number field failed: ${r1.status}`);

    const r2 = await post('auth/login', { username: 'LPU-SEC-001', password: 'DemoSecurity2026!' });
    if (r2.status !== 200) throw new Error(`username field failed: ${r2.status}`);

    const r3 = await post('auth/login', { regNo: 'LPU-ADM-001', password: 'DemoAdmin2026!' });
    if (r3.status !== 200) throw new Error(`regNo field failed: ${r3.status}`);
  });

  // 8. Incorrect Password Rejection
  await assertCase('8. Incorrect password rejection with HTTP 400', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: '12108801',
      password: 'IncorrectPassword999!',
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    if (res.data?.success !== false) throw new Error('Expected success=false');
  });

  // 9. Unknown Registration Number Rejection
  await assertCase('9. Unknown registration number rejection with HTTP 400', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: 'UNKNOWN_999999',
      password: 'DemoPassword2026!',
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    if (res.data?.success !== false) throw new Error('Expected success=false');
  });

  // 10. Missing / Malformed Request Fields
  await assertCase('10. Missing fields rejection (empty body, empty identifier)', async () => {
    const r1 = await post('auth/login', {});
    if (r1.status !== 400) throw new Error(`Expected 400, got ${r1.status}`);

    const r2 = await post('auth/login', { emailOrRegNo: '   ', password: 'SomePassword' });
    if (r2.status !== 400) throw new Error(`Expected 400, got ${r2.status}`);
  });

  // 11. Role-Based Access Control Guards
  let studentToken = '';
  await assertCase('11. Role-Based Access Control: Unauthorized role access blocked (403)', async () => {
    const studentLogin = await post('auth/login', {
      emailOrRegNo: '12108801',
      password: 'DemoStudent2026!',
    });
    studentToken = studentLogin.data.data.token;

    // Student -> Security Claims Queue -> 403 Forbidden
    const r1 = await get('claims/pending', { Authorization: `Bearer ${studentToken}` });
    if (r1.status !== 403) throw new Error(`Student accessing security claims expected 403, got ${r1.status}`);

    // Student -> Admin Analytics -> 403 Forbidden
    const r2 = await get('admin/analytics', { Authorization: `Bearer ${studentToken}` });
    if (r2.status !== 403) throw new Error(`Student accessing admin analytics expected 403, got ${r2.status}`);

    // Security -> Admin Analytics -> 403 Forbidden
    const r3 = await get('admin/analytics', { Authorization: `Bearer ${securityToken}` });
    if (r3.status !== 403) throw new Error(`Security accessing admin analytics expected 403, got ${r3.status}`);

    // Admin -> Admin Analytics -> 200 OK
    const r4 = await get('admin/analytics', { Authorization: `Bearer ${adminToken}` });
    if (r4.status !== 200) throw new Error(`Admin accessing admin analytics expected 200, got ${r4.status}`);

    // Security -> Security Claims Queue -> 200 OK
    const r5 = await get('claims/pending', { Authorization: `Bearer ${securityToken}` });
    if (r5.status !== 200) throw new Error(`Security accessing security claims expected 200, got ${r5.status}`);
  });

  // 12. Session Profile Inspection
  await assertCase('12. Session profile inspection (/api/v1/auth/me) with token', async () => {
    const res = await get('auth/me', { Authorization: `Bearer ${studentToken}` });
    if (res.status !== 200 || !res.data?.success) throw new Error(`Profile inspection failed: ${res.status}`);
    if (res.data.data.user.registrationNumber !== '12108801') throw new Error(`Wrong profile user: ${res.data.data.user.registrationNumber}`);
  });

  // 13. Logout Session Invalidation
  await assertCase('13. Logout session invalidation (/api/v1/auth/logout)', async () => {
    const res = await post('auth/logout', {});
    if (res.status !== 200 || !res.data?.success) throw new Error(`Logout failed: ${res.status}`);
  });

  // 14. Token Pair Verification
  let activeRefreshToken = '';
  await assertCase('14. Token Pair verification: Login produces accessToken and refreshToken', async () => {
    const res = await post('auth/login', {
      emailOrRegNo: '12108801',
      password: 'DemoStudent2026!',
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const d = res.data.data;
    if (!d.accessToken || !d.refreshToken) throw new Error('Missing accessToken or refreshToken');
    activeRefreshToken = d.refreshToken;
  });

  // 15. Token Refresh Endpoint
  await assertCase('15. Token Refresh: Exchange refreshToken for new accessToken', async () => {
    const res = await post('auth/token/refresh/', { refresh: activeRefreshToken });
    if (res.status !== 200) throw new Error(`Refresh failed with status ${res.status}: ${JSON.stringify(res.data)}`);
    const payload = res.data?.data || res.data;
    const newAccess = payload.access || payload.accessToken;
    if (!newAccess) throw new Error('Refresh response missing access token');

    // Verify new access token is valid on protected profile
    const profileRes = await get('auth/me', { Authorization: `Bearer ${newAccess}` });
    if (profileRes.status !== 200) throw new Error(`Profile access with refreshed token failed: ${profileRes.status}`);
  });

  // 16. Stale Authorization Header Guard on Login
  await assertCase('16. Stale Authorization header does not fail login (never returns 401)', async () => {
    const res = await post(
      'auth/login',
      { emailOrRegNo: '12108801', password: 'DemoStudent2026!' },
      { Authorization: 'Bearer stale.expired.invalid.jwt.token' }
    );
    if (res.status !== 200) throw new Error(`Stale token broke login with status ${res.status}`);
  });

  // 17. Refresh Token Rejection as Access Token
  await assertCase('17. Refresh token rejected when passed as Bearer access token (401)', async () => {
    const res = await get('auth/me', { Authorization: `Bearer ${activeRefreshToken}` });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  console.log('\n================================================================');
  console.log(`📊 Authentication Test Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} tests`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
