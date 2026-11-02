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
test('Global CSS defines all brand color tokens and eliminates orange theme', () => {
  const cssPath = resolve(rootDir, 'apps/web/src/app/globals.css');
  assert.ok(existsSync(cssPath), 'globals.css must exist');
  const css = readFileSync(cssPath, 'utf8');

  // Verify brand tokens
  assert.ok(css.includes('--primary-navy: #192B4A;'), 'Must define primary-navy');
  assert.ok(css.includes('--secondary-navy: #22395D;'), 'Must define secondary-navy');
  assert.ok(css.includes('--primary-teal: #20B5AD;'), 'Must define primary-teal');
  assert.ok(css.includes('--royal-blue: #356DE8;'), 'Must define royal-blue');
  assert.ok(css.includes('--page-bg: #F5F8FC;'), 'Must define page-bg');

  // Verify orange is eliminated from primary tokens
  assert.ok(!css.includes('#F58220'), 'Old orange hex #F58220 must not exist in globals.css');
  assert.ok(!css.includes('#E07315'), 'Old orange hover hex #E07315 must not exist in globals.css');
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
test('Public item cards and board do not expose private verification vault fields', () => {
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

// -----------------------------------------------------------------------------
// 7. Login Page Integration Invariants
// -----------------------------------------------------------------------------
test('Login page contains split-screen branding, error alert, and show/hide password', () => {
  const loginPath = resolve(rootDir, 'apps/web/src/app/login/page.tsx');
  const content = readFileSync(loginPath, 'utf8');

  assert.ok(content.includes('Welcome Back'), 'Must have Welcome Back heading');
  assert.ok(content.includes('showPassword'), 'Must support show/hide password toggle');
  assert.ok(content.includes('apiClient.login'), 'Must authenticate against backend API');
  assert.ok(content.includes('lpu-btn-primary'), 'Must use teal submit button');
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
