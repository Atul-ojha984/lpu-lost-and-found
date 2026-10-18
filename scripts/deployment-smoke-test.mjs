#!/usr/bin/env node
/**
 * ==============================================================================
 * LPU Lost & Found Property Recovery Platform — Production Smoke Test Script
 * Validates active endpoints, response schemas, and unauthorized boundary guards.
 *
 * Usage:
 *   node scripts/deployment-smoke-test.mjs [BASE_URL]
 * Default:
 *   http://localhost:5000
 * ==============================================================================
 */

let rawUrl = process.argv[2] || process.env.API_URL || 'http://localhost:8000';
rawUrl = rawUrl.replace(/\/+$/, '');
if (rawUrl.endsWith('/api/v1')) {
  rawUrl = rawUrl.slice(0, -7);
}
const BASE_URL = rawUrl;

const tests = [
  {
    name: '1. Root Welcome Endpoint',
    path: '/',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => data && data.service && data.service.includes('LPU'),
  },
  {
    name: '2. Health Check & Database Connectivity',
    path: '/api/v1/health',
    expectedStatus: 200,
    validate: (data) =>
      data &&
      data.success &&
      data.data &&
      (data.data.status === 'HEALTHY' || data.data.status === 'ok') &&
      data.data.database &&
      typeof data.data.database.connected === 'boolean',
  },
  {
    name: '3. Public Item Search Board (Sanitized)',
    path: '/api/v1/items?limit=5',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => {
      if (!data || !data.success) return false;
      const items = data.data?.items || data.data || [];
      // Verify privacy guarantee: zero private detail leakage
      for (const item of items) {
        if (item.passwordHash || item.privateVault || item.encryptedDetails || item.expectedAnswer) {
          throw new Error('Privacy Leak: sensitive field found in public item representation');
        }
      }
      return true;
    },
  },
  {
    name: '4. Campus Item Categories',
    path: '/api/v1/categories',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => data && data.success && Array.isArray(data.data) && data.data.length > 0,
  },
  {
    name: '5. Campus Locations',
    path: '/api/v1/locations',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => data && data.success && Array.isArray(data.data) && data.data.length > 0,
  },
  {
    name: '6. Unauthenticated Guard on Security Claims Queue (Must return 401)',
    path: '/api/v1/claims/pending',
    method: 'GET',
    expectedStatus: 401,
    validate: (data) => data && data.success === false,
  },
  {
    name: '7. Unauthenticated Guard on Administrative Analytics (Must return 401)',
    path: '/api/v1/admin/analytics',
    method: 'GET',
    expectedStatus: 401,
    validate: (data) => data && data.success === false,
  },
];

async function runSmokeTests() {
  console.log(`\n================================================================`);
  console.log(`🚀 Running LPU Lost & Found Deployment Smoke Tests`);
  console.log(`🎯 Target API URL: ${BASE_URL}`);
  console.log(`================================================================\n`);

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const url = `${BASE_URL}${t.path}`;
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: t.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LPU-SmokeTest-Runner/1.0',
        },
      });

      const elapsed = Date.now() - start;
      const json = await res.json().catch(() => null);

      if (res.status !== t.expectedStatus) {
        console.error(`❌ FAIL: ${t.name}`);
        console.error(`   Expected Status: ${t.expectedStatus}, Received: ${res.status} (${elapsed}ms)`);
        console.error(`   Body:`, JSON.stringify(json, null, 2));
        failed++;
        continue;
      }

      if (t.validate && !t.validate(json)) {
        console.error(`❌ FAIL: ${t.name}`);
        console.error(`   Validation predicate failed (${elapsed}ms)`);
        console.error(`   Body:`, JSON.stringify(json, null, 2));
        failed++;
        continue;
      }

      console.log(`✅ PASS: ${t.name} [HTTP ${res.status} - ${elapsed}ms]`);
      passed++;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`❌ ERROR: ${t.name} (${elapsed}ms)`);
      console.error(`   Exception:`, err.message);
      failed++;
    }
  }

  console.log(`\n================================================================`);
  console.log(`📊 Smoke Test Summary: ${passed} Passed, ${failed} Failed out of ${tests.length} tests`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests();
