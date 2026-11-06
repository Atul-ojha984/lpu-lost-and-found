/**
 * ==============================================================================
 * LPU Lost & Found Property Recovery Platform
 * End-to-End User Workflow & Security Smoke Test
 *
 * Exercises the complete multi-actor lifecycle:
 * 1. Verify public registration is disabled and Admin creates student personas
 * 2. Authenticate separate reporter and claimant accounts
 * 3. File a FOUND item report with private verification vault
 * 4. Verify presence in authenticated search and test filter queries
 * 5. Verify privacy boundaries on authenticated endpoints
 * 6. Claim item as peer student user
 * 7. Security review, challenge inspection, and claim approval
 * 8. Supervised physical handover via single-use cryptographic OTP
 * ==============================================================================
 */

let rawUrl = process.argv[2] || process.env.API_URL || 'http://localhost:8000/api/v1';
rawUrl = rawUrl.replace(/\/+$/, '');
if (!rawUrl.endsWith('/api/v1')) {
  rawUrl = `${rawUrl}/api/v1`;
}
const BASE_URL = rawUrl;
let adminToken = '';
const createdUserIds = [];

async function deactivateCreatedUsers() {
  if (!adminToken) return;
  for (const userId of createdUserIds) {
    const response = await fetch(`${BASE_URL}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await response.json().catch(() => null);
    if (response.status !== 200 || !(data?.data?.deleted || data?.data?.deactivated)) {
      throw new Error(`Test-account cleanup failed with HTTP ${response.status}.`);
    }
  }
}

async function runE2EWorkflow() {
  const apiHost = new URL(BASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(apiHost) && process.env.ALLOW_E2E_DATA_MUTATION !== 'true') {
    throw new Error('Refusing to create E2E data on a non-local API without ALLOW_E2E_DATA_MUTATION=true.');
  }
  console.log(`\n================================================================`);
  console.log(`🚀 Starting Comprehensive LPU E2E Multi-Actor Workflow Smoke Test`);
  console.log(`🎯 API Target: ${BASE_URL}`);
  console.log(`================================================================\n`);

  const timestamp = Date.now();
  const testStudentEmail = `smoke.student.${timestamp}@lpu.in`;
  const testStudentReg = `REG-${timestamp.toString().slice(-6)}`;
  const testClaimantEmail = `smoke.claimant.${timestamp}@lpu.in`;
  const testClaimantReg = `CLM-${timestamp.toString().slice(-6)}`;
  const testPassword = 'Student@12345';

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to create E2E accounts against a production environment.');
  }

  const publicRegistration = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Unauthorized E2E User',
      registrationNumber: testStudentReg,
      email: testStudentEmail,
      password: testPassword,
      confirmPassword: testPassword,
    }),
  });
  if (publicRegistration.status !== 403) {
    throw new Error(`Public registration should return HTTP 403; got ${publicRegistration.status}`);
  }

  const adminLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrRegNo: process.env.E2E_ADMIN_ID || 'LPU-ADM-001',
      password: process.env.E2E_ADMIN_PASSWORD || 'DemoAdmin2026!',
    }),
  });
  const adminData = await adminLogin.json();
  if (adminLogin.status !== 200 || adminData.data?.user?.role !== 'CAMPUS_ADMIN') {
    throw new Error(`Administrator login failed with HTTP ${adminLogin.status}`);
  }
  adminToken = adminData.data.token;

  // 1. ADMIN-CONTROLLED ACCOUNT CREATION
  console.log('1️⃣ Admin creates student accounts...');
  const regRes = await fetch(`${BASE_URL}/admin/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: 'Smoke Test Candidate',
      registrationNumber: testStudentReg,
      email: testStudentEmail,
      password: testPassword,
      userType: 'STUDENT',
      department: 'School of Computer Science & Engineering',
      isActive: true,
    }),
  });
  const regData = await regRes.json();
  if (regRes.status !== 201 || !regData.success) {
    throw new Error(`Admin account creation failed with HTTP ${regRes.status}`);
  }
  const studentUserId = regData.data.id || regData.data._id;
  createdUserIds.push(studentUserId);
  const claimantCreateRes = await fetch(`${BASE_URL}/admin/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: 'Smoke Test Claimant',
      registrationNumber: testClaimantReg,
      email: testClaimantEmail,
      password: testPassword,
      userType: 'STUDENT',
      department: 'School of Computer Science & Engineering',
      isActive: true,
    }),
  });
  const claimantCreateData = await claimantCreateRes.json();
  if (claimantCreateRes.status !== 201 || !claimantCreateData.success) {
    throw new Error(`Admin claimant account creation failed with HTTP ${claimantCreateRes.status}`);
  }
  const claimantUserId = claimantCreateData.data.id || claimantCreateData.data._id;
  createdUserIds.push(claimantUserId);
  console.log(`   ✅ Registered student: ${testStudentEmail} (ID: ${studentUserId})`);

  // 2. LOGIN
  console.log('\n2️⃣ Testing student login authentication...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrRegNo: testStudentEmail,
      password: testPassword,
    }),
  });
  const loginData = await loginRes.json();
  if (loginRes.status !== 200 || !loginData.success) {
    throw new Error(`Login failed with HTTP ${loginRes.status}`);
  }
  const studentToken = loginData.data.token;
  console.log(`   ✅ Login authenticated. Role: ${loginData.data.user.role}`);

  // Fetch category & location IDs
  const catRes = await fetch(`${BASE_URL}/categories`, { headers: { Authorization: `Bearer ${studentToken}` } });
  const catData = await catRes.json();
  const categoryId = catData.data.find(c => c.code === 'ELECTRONICS')?._id || catData.data[0]._id;

  const locRes = await fetch(`${BASE_URL}/locations`, { headers: { Authorization: `Bearer ${studentToken}` } });
  const locData = await locRes.json();
  const locationId = locData.data.find(l => l.code === 'BLOCK_30_38')?._id || locData.data[0]._id;

  // 3. SUBMIT FOUND REPORT
  console.log('\n3️⃣ Filing a FOUND item report with private verification vault...');
  const reportRes = await fetch(`${BASE_URL}/items/found`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({
      itemType: 'FOUND',
      title: `Casio Scientific Calculator FX-${timestamp.toString().slice(-4)}`,
      category: categoryId,
      location: locationId,
      specificLocation: 'Block 34, 3rd Floor Room 304 desk',
      eventDate: new Date().toISOString(),
      publicDescription: 'Found black casing scientific calculator on desk in Block 34 Room 304.',
      privateIdentifyingDetails: 'Back battery door has custom holographic sticker "LPU-CSE-2026"',
      verificationQuestions: [
        {
          questionText: 'What custom sticker is on the battery door?',
          expectedAnswer: 'LPU-CSE-2026',
        },
      ],
    }),
  });
  const reportData = await reportRes.json();
  if (reportRes.status !== 201 || !reportData.success) {
    throw new Error(`Report submission failed with HTTP ${reportRes.status}`);
  }
  const itemId = reportData.data.id || reportData.data._id;
  const itemRef = reportData.data.referenceNumber;
  console.log(`   ✅ Created FOUND item: "${reportData.data.title}" [Ref: ${itemRef}, ID: ${itemId}]`);

  // 4. AUTHENTICATED SEARCH BOARD & PRIVACY AUDIT
  console.log('\n4️⃣ Verifying authenticated search & auditing for private detail leaks...');
  const searchRes = await fetch(`${BASE_URL}/items?search=Calculator&limit=10`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const searchData = await searchRes.json();
  if (searchRes.status !== 200 || !searchData.success) {
    throw new Error(`Authenticated item search failed with HTTP ${searchRes.status}`);
  }

  const items = searchData.data.items || searchData.data;
  const foundInBoard = items.find(i => String(i.id || i._id) === String(itemId));
  if (!foundInBoard) {
    throw new Error(`Item ${itemId} not found on public board`);
  }
  console.log(`   ✅ Verified item appears in authenticated search.`);

  // Audit public payload: verify zero private leakage
  const serializedStr = JSON.stringify(foundInBoard);
  if (
    serializedStr.includes('LPU-CSE-2026') ||
    serializedStr.includes('passwordHash') ||
    serializedStr.includes('privateVault') ||
    serializedStr.includes('expectedAnswer')
  ) {
    throw new Error('❌ PRIVACY LEAK: Private verification vault or answer exposed on public board!');
  }
  console.log(`   🔒 Privacy Audit Passed: Zero private vault details or challenge answers exposed.`);

  // 5. CLAIM BY PEER STUDENT
  console.log('\n5️⃣ Submitting ownership claim as peer student (a separate student account)...');
  const student2Login = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrRegNo: testClaimantReg, password: testPassword }),
  });
  const s2Data = await student2Login.json();
  const s2Token = s2Data.data.token;

  // Fetch verification challenges for item
  const chalRes = await fetch(`${BASE_URL}/items/${itemId}/challenges`, {
    headers: { Authorization: `Bearer ${s2Token}` },
  });
  const chalData = await chalRes.json();
  const challengeId = chalData.data?.[0]?.id;

  const claimRes = await fetch(`${BASE_URL}/claims`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s2Token}`,
    },
    body: JSON.stringify({
      itemId: itemId,
      statement: 'I left my scientific calculator in Block 34 Room 304 after math lecture.',
      challengeAnswers: challengeId
        ? [
            {
              challengeId: challengeId,
              providedAnswer: 'LPU-CSE-2026',
            },
          ]
        : undefined,
    }),
  });
  const claimData = await claimRes.json();
  if (claimRes.status !== 201 || !claimData.success) {
    throw new Error(`Claim submission failed with HTTP ${claimRes.status}`);
  }
  const claimId = claimData.data.id || claimData.data._id;
  console.log(`   ✅ Claim registered [ID: ${claimId}, Status: ${claimData.data.claimStatus}]`);

  // 6. SECURITY REVIEW & APPROVAL
  console.log('\n6️⃣ Security Officer review & claim approval...');
  const secLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrRegNo: process.env.E2E_SECURITY_ID || 'LPU-SEC-001',
      password: process.env.E2E_SECURITY_PASSWORD || 'DemoSecurity2026!',
    }),
  });
  const secData = await secLogin.json();
  const secToken = secData.data.token;

  // View private vault as security officer
  const vaultRes = await fetch(`${BASE_URL}/items/${itemId}/private-vault/view`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secToken}` },
  });
  const vaultData = await vaultRes.json();
  if (vaultRes.status !== 200 || !vaultData.success) {
    throw new Error(`Security private vault access failed with HTTP ${vaultRes.status}`);
  }
  console.log('   🔍 Security inspected the private vault; decrypted values are not logged.');

  // Approve claim
  const approveRes = await fetch(`${BASE_URL}/claims/${claimId}/review`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secToken}`,
    },
    body: JSON.stringify({
      action: 'APPROVE',
      reviewNotes: 'Verified matching holographic sticker description with claimant statement.',
    }),
  });
  const approveData = await approveRes.json();
  if (approveRes.status !== 200 || !approveData.success) {
    throw new Error(`Claim review failed with HTTP ${approveRes.status}`);
  }
  const reviewedClaim = approveData.data;
  console.log(`   ✅ Claim approved! Status: ${reviewedClaim.claimStatus}`);

  // 7. RETRIEVE CLAIMANT OTP
  console.log('\n7️⃣ Retrieving 6-digit Handover OTP from Claimant Dashboard...');
  const myClaimsRes = await fetch(`${BASE_URL}/claims/my-claims`, {
    headers: { Authorization: `Bearer ${s2Token}` },
  });
  const myClaimsData = await myClaimsRes.json();
  const myApprovedClaim = (myClaimsData.data || []).find(c => String(c.id || c._id) === String(claimId));
  const handoverOtp = myApprovedClaim?.handoverOtp;
  if (!handoverOtp || handoverOtp.length !== 6) {
    throw new Error('Claimant did not receive a valid 6-digit handover OTP.');
  }
  console.log('   🔑 Claimant received a single-use handover OTP (value redacted).');

  // 8. COMPLETE SUPERVISED HANDOVER
  console.log('\n8️⃣ Security Officer verifying OTP and executing physical custody handover...');
  const handoverRes = await fetch(`${BASE_URL}/handovers/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secToken}`,
    },
    body: JSON.stringify({
      claimId,
      otp: handoverOtp,
      physicalDeskLocation: 'Block 34 Central Security Desk',
      idCardPresentedType: 'CAMPUS_ID',
      idCardNumber: testClaimantReg,
      acknowledgementNotes: 'Physical calculator handed over after identity card verification.',
    }),
  });
  const handoverData = await handoverRes.json();
  if (handoverRes.status !== 200 || !handoverData.success) {
    throw new Error(`Handover failed with HTTP ${handoverRes.status}`);
  }
  const receipt = handoverData.data;
  console.log(`   🎉 Supervised handover complete! Handover ID: ${receipt.handoverId}`);
  console.log(`   📄 Receipt Generated: Item "${receipt.itemTitle}" released to ${receipt.recipientName} (${receipt.recipientRegNo})`);

  // Verify item status in database
  const itemCheckRes = await fetch(`${BASE_URL}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${s2Token}` },
  });
  const itemCheckData = await itemCheckRes.json();
  const currentStatus = itemCheckData.data.status;
  console.log(`   📦 Item Status Verified: ${currentStatus}`);
  if (currentStatus !== 'HANDED_OVER') {
    throw new Error(`Expected item status HANDED_OVER, but got ${currentStatus}`);
  }

  const completedClaimsRes = await fetch(`${BASE_URL}/claims/my-claims`, {
    headers: { Authorization: `Bearer ${s2Token}` },
  });
  const completedClaimsData = await completedClaimsRes.json();
  if (completedClaimsRes.status !== 200 || (completedClaimsData.data || []).some(c => String(c.id || c._id) === String(claimId))) {
    throw new Error('Completed claim remained in My Claims after handover.');
  }

  const recoveryHistoryRes = await fetch(`${BASE_URL}/handovers/my-recovery-history`, {
    headers: { Authorization: `Bearer ${s2Token}` },
  });
  const recoveryHistoryData = await recoveryHistoryRes.json();
  const recovered = (recoveryHistoryData.data || []).find(entry => String(entry.claimId) === String(claimId));
  if (recoveryHistoryRes.status !== 200 || !recovered) {
    throw new Error('Completed claim did not appear in the claimant Recovery History.');
  }

  const pendingHandoversRes = await fetch(`${BASE_URL}/handovers/pending`, {
    headers: { Authorization: `Bearer ${secToken}` },
  });
  const pendingHandoversData = await pendingHandoversRes.json();
  const pendingHandovers = pendingHandoversData.data || [];
  if (pendingHandoversRes.status !== 200) {
    throw new Error(`Security pending-handover lookup failed with HTTP ${pendingHandoversRes.status}`);
  }
  if (pendingHandovers.some(entry => String(entry.claim?.id || entry.claimId) === String(claimId))) {
    throw new Error('Completed claim remained in the Pending Handover queue.');
  }

  const slipRes = await fetch(`${BASE_URL}/handovers/${receipt.handoverId}/slip`, {
    headers: { Authorization: `Bearer ${secToken}` },
  });
  const slipData = await slipRes.json();
  if (slipRes.status !== 200 || String(slipData.data?.claimId) !== String(claimId)) {
    throw new Error(`Completed handover slip was unavailable (HTTP ${slipRes.status}).`);
  }
  if (JSON.stringify(slipData).includes(handoverOtp)) {
    throw new Error('Handover slip exposed an OTP value.');
  }

  const evidenceRes = await fetch(`${BASE_URL}/claims/${claimId}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s2Token}` },
  });
  const evidenceData = await evidenceRes.json();
  if (evidenceRes.status !== 409 || evidenceData.error?.code !== 'RECOVERY_COMPLETED') {
    throw new Error(`Evidence upload was not blocked after recovery (HTTP ${evidenceRes.status}).`);
  }

  const duplicateHandoverRes = await fetch(`${BASE_URL}/handovers/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secToken}`,
    },
    body: JSON.stringify({
      claimId,
      otp: handoverOtp,
      physicalDeskLocation: 'Block 34 Central Security Desk',
      idCardPresentedType: 'CAMPUS_ID',
      idCardNumber: testClaimantReg,
    }),
  });
  if (![400, 409].includes(duplicateHandoverRes.status)) {
    throw new Error(`Duplicate handover was not rejected (HTTP ${duplicateHandoverRes.status}).`);
  }

  // Verify item cannot be claimed again
  const duplicateClaim = await fetch(`${BASE_URL}/claims`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({
      item: itemId,
      statement: 'Attempting duplicate claim on already handed over property.',
    }),
  });
  if (duplicateClaim.status === 201) {
    throw new Error('❌ VULNERABILITY: Allowed claim on already handed-over item!');
  }
  console.log(`   🛡️ Re-claim guard verified: Attempted claim on handed-over item rejected with HTTP ${duplicateClaim.status}`);

  console.log(`\n================================================================`);
  console.log(`🏁 All E2E Workflow Checks Passed Successfully!`);
  console.log(`================================================================\n`);
}

runE2EWorkflow().then(deactivateCreatedUsers).catch(async (err) => {
  console.error('\n❌ E2E Workflow Error:', err.message);
  try {
    await deactivateCreatedUsers();
  } catch {
    console.error('E2E test accounts could not be safely deactivated.');
  }
  process.exit(1);
});
