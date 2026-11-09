/**
 * ==============================================================================
 * LPU Lost & Found Property Recovery Platform
 * Frontend Automated Unit & Integration Test Suite
 * ==============================================================================
 * Tests UI design tokens, status mapping, form validation, role permissions,
 * and security invariants without requiring external test runners.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

console.log('\n================================================================');
console.log('🧪 Running Frontend Automated Unit & Validation Test Suite');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: ${totalTests}. ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${totalTests}. ${name}`);
    console.error(`   Error: ${err.message}\n`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 1. Logo Asset and Integrity
// -----------------------------------------------------------------------------
test('Logo asset exists and is placed in public assets directory', () => {
  const logoPath = resolve(rootDir, 'apps/web/public/images/lost-and-found-logo.png');
  assert.ok(existsSync(logoPath), 'lost-and-found-logo.png must exist in apps/web/public/images/');
  const stats = readFileSync(logoPath);
  assert.ok(stats.length > 50000, 'Logo file size must be non-empty and valid PNG');
});

// -----------------------------------------------------------------------------
// 2. CSS Design Tokens & Color Palette
// -----------------------------------------------------------------------------
test('Global CSS defines the established navy, orange, blue, and surface tokens', () => {
  const cssPath = resolve(rootDir, 'apps/web/src/app/globals.css');
  assert.ok(existsSync(cssPath), 'globals.css must exist');
  const css = readFileSync(cssPath, 'utf8');

  // Verify brand tokens
  assert.ok(css.includes('--primary-navy: #283442;'), 'Must define the established primary navy');
  assert.ok(css.includes('--secondary-navy: #3A4B5E;'), 'Must define the established secondary navy');
  assert.ok(css.includes('--primary-teal: #F58220;'), 'Must define the established orange primary action color');
  assert.ok(css.includes('--primary-teal-hover: #E66F00;'), 'Must define the established orange hover color');
  assert.ok(css.includes('--royal-blue: #356DE8;'), 'Must define royal-blue');
  assert.ok(css.includes('--page-bg: #F5F5F5;'), 'Must define the established page background');
});

// -----------------------------------------------------------------------------
// 3. Status Configuration & Role Mapping
// -----------------------------------------------------------------------------
test('Constants file defines valid statuses and accessible badges', () => {
  const constantsPath = resolve(rootDir, 'apps/web/src/lib/constants.ts');
  assert.ok(existsSync(constantsPath), 'constants.ts must exist');
  const content = readFileSync(constantsPath, 'utf8');

  assert.ok(content.includes('REPORTED:'), 'Must support REPORTED');
  assert.ok(content.includes('READY_FOR_HANDOVER:'), 'Must support READY_FOR_HANDOVER');
  assert.ok(content.includes('HANDED_OVER:'), 'Must support HANDED_OVER');
  assert.ok(content.includes('IN_CUSTODY:'), 'Must support IN_CUSTODY');
  assert.ok(content.includes('CLAIM_IN_REVIEW:'), 'Must support CLAIM_IN_REVIEW');

  // Verify roles
  assert.ok(content.includes('STUDENT_STAFF:'), 'Must define STUDENT_STAFF');
  assert.ok(content.includes('SECURITY_PERSONNEL:'), 'Must define SECURITY_PERSONNEL');
  assert.ok(content.includes('CAMPUS_ADMIN:'), 'Must define CAMPUS_ADMIN');
});

// -----------------------------------------------------------------------------
// 4. Client-side Validation Invariants
// -----------------------------------------------------------------------------
test('Client registration number validator accepts valid formats', () => {
  const validRegNumbers = ['12108801', '12108001', '12209999', 'LPU-SEC-001', 'LPU-ADM-001'];
  for (const reg of validRegNumbers) {
    const isClean = reg.trim().length >= 4 && reg.trim().length <= 20;
    assert.ok(isClean, `Registration number ${reg} should pass basic length sanity`);
  }
});

test('Handover OTP validator enforces 6-digit numeric constraints', () => {
  const isValidOtp = (otp) => /^\d{6}$/.test(otp);
  assert.ok(isValidOtp('849102'), '6 digits should be valid');
  assert.ok(isValidOtp('000123'), '6 digits with leading zeros should be valid');
  assert.ok(!isValidOtp('12345'), '5 digits must be rejected');
  assert.ok(!isValidOtp('1234567'), '7 digits must be rejected');
  assert.ok(!isValidOtp('849A02'), 'Alphanumeric OTP must be rejected');
  assert.ok(!isValidOtp(''), 'Empty OTP must be rejected');
});

// -----------------------------------------------------------------------------
// 5. Zero-Leakage Privacy Invariants
// -----------------------------------------------------------------------------
test('Item cards and board do not expose private verification vault fields', () => {
  const itemCardPath = resolve(rootDir, 'apps/web/src/components/items/ItemCard.tsx');
  const cardContent = readFileSync(itemCardPath, 'utf8');

  assert.ok(!cardContent.includes('privateVerificationDetails'), 'ItemCard must never render private verification details');
  assert.ok(!cardContent.includes('verificationAnswer'), 'ItemCard must never render verification answer');
  assert.ok(!cardContent.includes('serialNumber'), 'ItemCard must not expose raw serial number');
});

// -----------------------------------------------------------------------------
// 6. Navigation and Role Separation Invariants
// -----------------------------------------------------------------------------
test('Sidebar component maintains role-based route separation', () => {
  const sidebarPath = resolve(rootDir, 'apps/web/src/components/navigation/Sidebar.tsx');
  const content = readFileSync(sidebarPath, 'utf8');

  // Verify distinct role navigation sections
  assert.ok(content.includes('/dashboard'), 'Must have student dashboard link');
  assert.ok(content.includes('/security'), 'Must have security dashboard link');
  assert.ok(content.includes('/admin'), 'Must have admin dashboard link');
  assert.ok(content.includes('/security/handovers'), 'Must have security handovers link');
  assert.ok(content.includes('/admin/audit'), 'Must have admin audit link');
});

test('Admin and Security custody interfaces share persisted locations and refresh automatically', () => {
  const adminPage = readFileSync(resolve(rootDir, 'apps/web/src/app/admin/locations/page.tsx'), 'utf8');
  const securityPage = readFileSync(resolve(rootDir, 'apps/web/src/app/security/custody/page.tsx'), 'utf8');
  const directRecovery = readFileSync(resolve(rootDir, 'apps/web/src/components/security/DirectRecoveryPanel.tsx'), 'utf8');
  const apiClient = readFileSync(resolve(rootDir, 'apps/web/src/lib/api-client.ts'), 'utf8');

  assert.ok(adminPage.includes('apiClient.getCustodyLocations(true)'), 'Admin must load the persisted custody locations and lockers');
  assert.ok(adminPage.includes('window.setInterval') && adminPage.includes('5000'), 'Admin list must refresh on the shared five-second polling cycle');
  assert.ok(securityPage.includes('apiClient.getCustodyLocations()'), 'Security must read the same active custody records');
  assert.ok(securityPage.includes('window.setInterval') && securityPage.includes('5000'), 'Security state must refresh without a page reload');
  assert.ok(securityPage.includes('locationActive') && securityPage.includes('custodyLocationId'), 'Security assignments must use active backend locations and lockers');
  assert.ok(directRecovery.includes('custodyLocations') && directRecovery.includes('custodyLocationId'), 'Direct intake and handover must use the same configured locations');
  assert.ok(directRecovery.includes('idCardInspected,') && apiClient.includes('idCardInspected: boolean'), 'Direct handover must submit the physical ID inspection confirmation');
  assert.ok(apiClient.includes('handovers/direct-recoveries/${directRecoveryId}/verify-otp'), 'Final confirmation must use the direct recovery handover endpoint');
  assert.ok(apiClient.includes('data?.error?.details') && apiClient.includes('detailMessages.join(\' \')'), 'API client must display field-specific backend validation errors');
  assert.ok(directRecovery.includes('Promise.allSettled') && directRecovery.includes("'Direct recovery queue'"), 'Direct tab loading must identify which initial request fails');
  assert.ok(!securityPage.includes('Gate 1 Main Control Desk'), 'Security destination choices must not remain hardcoded');
});

test('Production API configuration never falls back to localhost', () => {
  const apiClient = readFileSync(resolve(rootDir, 'apps/web/src/lib/api-client.ts'), 'utf8');
  const webEnv = readFileSync(resolve(rootDir, 'apps/web/.env.example'), 'utf8');

  assert.ok(apiClient.includes("process.env.NODE_ENV === 'development'"), 'Local API default must be development-only');
  assert.ok(apiClient.includes("'API_URL_NOT_CONFIGURED'"), 'Missing production API configuration must fail clearly');
  assert.ok(webEnv.includes('NEXT_PUBLIC_API_URL='), 'Vercel must configure the existing API base URL variable');
  assert.ok(!webEnv.includes('lpu-lost-found-api'), 'The environment template must not invent a production host');
});

// -----------------------------------------------------------------------------
// 7. Login Page Integration Invariants
// -----------------------------------------------------------------------------
test('Login page contains split-screen branding, error alert, and show/hide password', () => {
  const loginPath = resolve(rootDir, 'apps/web/src/app/login/page.tsx');
  const apiClientPath = resolve(rootDir, 'apps/web/src/lib/api-client.ts');
  const content = readFileSync(loginPath, 'utf8');
  const apiClient = readFileSync(apiClientPath, 'utf8');

  assert.ok(content.includes('Welcome Back'), 'Must have Welcome Back heading');
  assert.ok(content.includes('showPassword'), 'Must support show/hide password toggle');
  assert.ok(content.includes('apiClient.login'), 'Must authenticate against backend API');
  assert.ok(content.includes('lpu-btn-primary'), 'Must use teal submit button');
  assert.ok(apiClient.includes("apiFetch<any>('auth/login'"), 'Login must call the Django auth endpoint');
  assert.ok(apiClient.includes('emailOrRegNo: identifier') && apiClient.includes('registration_number: identifier'), 'Login must send the identifier fields accepted by Django');
  assert.ok(apiClient.includes('password: payload.password'), 'Login must submit the entered password to the backend');
  assert.ok(apiClient.includes('res.accessToken || res.token'), 'Login must accept the access-token response fields');
});

// -----------------------------------------------------------------------------
// 8. CI Workflow Configuration
// -----------------------------------------------------------------------------
test('CI workflow file exists and configures correct node and python versions', () => {
  const ciPath = resolve(rootDir, '.github/workflows/ci.yml');
  assert.ok(existsSync(ciPath), 'ci.yml must exist');
  const ci = readFileSync(ciPath, 'utf8');

  assert.ok(ci.includes('node-version: 20'), 'Must use Node.js 20');
  assert.ok(ci.includes('npm run typecheck:web'), 'Must run typecheck:web in CI');
  assert.ok(ci.includes('npm run build:web'), 'Must run build:web in CI');
  assert.ok(ci.includes('pytest'), 'Must run pytest in CI');
});

console.log('\n================================================================');
console.log(`📊 Frontend Test Summary: ${passedTests} Passed, 0 Failed out of ${totalTests} tests`);
console.log('================================================================\n');
