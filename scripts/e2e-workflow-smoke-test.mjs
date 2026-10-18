/**
 * ==============================================================================
 * LPU Lost & Found Property Recovery Platform
 * End-to-End User Workflow & Security Smoke Test
 *
 * Exercises the complete multi-actor lifecycle:
 * 1. Register new student persona
 * 2. Authenticate and retrieve session
 * 3. File a FOUND item report with private verification vault
 * 4. Verify presence on public board and test search/filter queries
 * 5. Verify zero-privacy leakage on public endpoints
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

async function runE2EWorkflow() {
  console.log(`\n================================================================`);
  console.log(`🚀 Starting Comprehensive LPU E2E Multi-Actor Workflow Smoke Test`);
  console.log(`🎯 API Target: ${BASE_URL}`);
  console.log(`================================================================\n`);

  const timestamp = Date.now();
  const testStudentEmail = `smoke.student.${timestamp}@lpu.in`;
  const testStudentReg = `REG-${timestamp.toString().slice(-6)}`;
  const testPassword = 'Student@12345';

  // 1. REGISTER
  console.log('1️⃣ Registering new student account...');
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Smoke Test Candidate',
      registrationNumber: testStudentReg,
      email: testStudentEmail,
      password: testPassword,
      confirmPassword: testPassword,
      department: 'School of Computer Science & Engineering',
    }),
  });
  const regData = await regRes.json();
  if (regRes.status !== 201 || !regData.success) {
    throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
  }
  const studentToken = regData.data.token;
  const studentUserId = regData.data.user.id || regData.data.user._id;
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
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  console.log(`   ✅ Login authenticated. Role: ${loginData.data.user.role}`);

  // Fetch category & location IDs
  const catRes = await fetch(`${BASE_URL}/categories`);
  const catData = await catRes.json();
  const categoryId = catData.data.find(c => c.code === 'ELECTRONICS')?._id || catData.data[0]._id;

  const locRes = await fetch(`${BASE_URL}/locations`);
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
    throw new Error(`Report submission failed: ${JSON.stringify(reportData)}`);
  }
  const itemId = reportData.data.id || reportData.data._id;
  const itemRef = reportData.data.referenceNumber;
  console.log(`   ✅ Created FOUND item: "${reportData.data.title}" [Ref: ${itemRef}, ID: ${itemId}]`);

  // 4. PUBLIC SEARCH BOARD & PRIVACY AUDIT
  console.log('\n4️⃣ Verifying public search board & auditing for private detail leaks...');
  const searchRes = await fetch(`${BASE_URL}/items?search=Calculator&limit=10`);
  const searchData = await searchRes.json();
  if (searchRes.status !== 200 || !searchData.success) {
    throw new Error(`Public search failed: ${JSON.stringify(searchData)}`);
  }

  const items = searchData.data.items || searchData.data;
  const foundInBoard = items.find(i => String(i.id || i._id) === String(itemId));
  if (!foundInBoard) {
    throw new Error(`Item ${itemId} not found on public board`);
  }
  console.log(`   ✅ Verified item appears on public search board.`);

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
  console.log('\n5️⃣ Submitting ownership claim as peer student (student2@lpu.co.in)...');
  const student2Login = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrRegNo: 'student2@lpu.co.in', password: 'Student@12345' }),
  });
  const s2Data = await student2Login.json();
  const s2Token = s2Data.data.token;

  // Fetch verification challenges for item
  const chalRes = await fetch(`${BASE_URL}/items/${itemId}/challenges`);
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
    throw new Error(`Claim submission failed: ${JSON.stringify(claimData)}`);
  }
  const claimId = claimData.data.id || claimData.data._id;
  console.log(`   ✅ Claim registered [ID: ${claimId}, Status: ${claimData.data.claimStatus}]`);

  // 6. SECURITY REVIEW & APPROVAL
  console.log('\n6️⃣ Security Officer review & claim approval...');
  const secLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrRegNo: 'security@lpu.co.in', password: 'Security@12345' }),
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
    throw new Error(`Security private vault access failed: ${JSON.stringify(vaultData)}`);
  }
  console.log(`   🔍 Security inspected private vault (Decrypted answer: "${vaultData.data.decryptedContent}")`);

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
    throw new Error(`Claim review failed: ${JSON.stringify(approveData)}`);
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
    throw new Error(`Claimant did not receive 6-digit handover OTP: ${JSON.stringify(myApprovedClaim)}`);
  }
  console.log(`   🔑 Claimant received single-use Handover OTP: [${handoverOtp}]`);

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
      idCardNumber: 'LPU-12105678',
      acknowledgementNotes: 'Physical calculator handed over after identity card verification.',
    }),
  });
  const handoverData = await handoverRes.json();
  if (handoverRes.status !== 200 || !handoverData.success) {
    throw new Error(`Handover failed: ${JSON.stringify(handoverData)}`);
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
  console.log(`🏁 All 8 E2E Workflow Steps Passed Successfully!`);
  console.log(`================================================================\n`);
}

runE2EWorkflow().catch((err) => {
  console.error('\n❌ E2E Workflow Error:', err.message);
  process.exit(1);
});
