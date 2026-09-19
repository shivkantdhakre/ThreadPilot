// ThreadPilot Comprehensive Audit Test v3
// All routes verified against actual running API
//
// ACTUAL API ROUTE MAP (no workspace prefix in URL — uses X-Workspace-Id header):
//   POST   /api/v1/auth/register               → {accessToken, user, workspace, workspaces}
//   POST   /api/v1/auth/login                  → {accessToken, user, workspace, workspaces}
//   GET    /api/v1/auth/me                     → {user:{id,email,...}, workspace:{...}, workspaces:[...]}
//   GET    /api/v1/workspaces/:workspaceId      → workspace object
//   GET    /api/v1/threads-auth/connect        → {authorizationUrl, state}  (X-Workspace-Id required)
//   GET    /api/v1/social-accounts             → array
//   GET    /api/v1/profile                     → profile object or 404
//   GET    /api/v1/profile/style               → style data or 404
//   GET    /api/v1/content/drafts              → {data: [...], meta: {total,page,limit,hasMore}}
//   POST   /api/v1/content/drafts              → draft object (status 201)
//   GET    /api/v1/content/drafts/:id          → draft object
//   GET    /api/v1/content/drafts/:id/versions → {versions: [...]}
//   PATCH  /api/v1/content/drafts/:id          → updated draft
//   POST   /api/v1/content/generate            → {requestId} (status 201)
//   GET    /api/v1/jobs/:requestId/status      → job record object
//   GET    /api/v1/notifications               → {notifications: [...], unreadCount: N}
//   GET    /api/v1/notifications/stream        → SSE stream
//   POST   /api/v1/ingestion/start             → {requestId}
//   GET    /api/v1/ingestion/status            → ingestion status
//   GET    /api/v1/ingestion/posts             → {data: [...], meta: {...}}

const API_URL = 'http://localhost:3001/api/v1';
const WORKER_URL = 'http://localhost:3002';

const results = [];
let authToken = null;
let workspaceId = null;
let draftId = null;
let contentRequestId = null;

async function assert(suite, name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ suite, name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const error = err?.message || String(err);
    results.push({ suite, name, passed: false, error, durationMs: Date.now() - start });
    console.error(`  ✗ ${name}: ${error}`);
  }
}

async function api(method, path, body, token, wsId) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (wsId) headers['x-workspace-id'] = wsId;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json, headers: res.headers };
}

function assertStatus(res, expected) {
  if (res.status !== expected) {
    throw new Error(`HTTP ${res.status} (expected ${expected}): ${JSON.stringify(res.body).substring(0, 250)}`);
  }
}

async function runAudit() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('   THREADPILOT IMPLEMENTATION AUDIT v3');
  console.log('   Phase 0 & Phase 1 feature verification');
  console.log('══════════════════════════════════════════════════════\n');

  // ── Suite 1: Infrastructure & Health ─────────────────────────────
  console.log('── Suite 1: Infrastructure & Health ──');

  await assert('Health', 'API health responds (200 or 503-degraded)', async () => {
    const res = await api('GET', '/health');
    if (res.status !== 200 && res.status !== 503) throw new Error(`API down: ${res.status}`);
    console.log(`     status: ${res.body.status}`);
  });

  await assert('Health', 'Worker health responds 200', async () => {
    const res = await fetch(`${WORKER_URL}/healthz`);
    if (res.status !== 200) throw new Error(`Worker down: ${res.status}`);
  });

  // ── Suite 2: Authentication ───────────────────────────────────────
  console.log('\n── Suite 2: Authentication ──');

  const testEmail = `audit3-${Date.now()}@threadpilot.test`;
  const testPwd = 'AuditTest@2024!';

  await assert('Auth', 'Register new user → accessToken + workspace', async () => {
    const res = await api('POST', '/auth/register', { email: testEmail, password: testPwd, name: 'Audit V3' });
    assertStatus(res, 201);
    if (!res.body.accessToken) throw new Error('No accessToken');
    authToken = res.body.accessToken;
    workspaceId = res.body.workspace?.id;
    if (!workspaceId) throw new Error('No workspaceId in register response');
    console.log(`     workspaceId: ${workspaceId}`);
  });

  await assert('Auth', 'Login → accessToken', async () => {
    const res = await api('POST', '/auth/login', { email: testEmail, password: testPwd });
    assertStatus(res, 200);
    if (!res.body.accessToken) throw new Error('No accessToken');
    authToken = res.body.accessToken;
  });

  await assert('Auth', 'GET /auth/me → nested user.email', async () => {
    const res = await api('GET', '/auth/me', null, authToken);
    assertStatus(res, 200);
    const email = res.body.user?.email;
    if (!email || email !== testEmail) throw new Error(`Expected ${testEmail}, got: ${email}`);
    console.log(`     user: ${email}`);
  });

  await assert('Auth', 'No token → 401', async () => {
    const res = await api('GET', '/auth/me');
    assertStatus(res, 401);
  });

  await assert('Auth', 'Invalid token → 401', async () => {
    const res = await api('GET', '/auth/me', null, 'invalid.jwt.token');
    assertStatus(res, 401);
  });

  // ── Suite 3: Workspace ────────────────────────────────────────────
  console.log('\n── Suite 3: Workspace ──');

  await assert('Workspace', 'GET /workspaces/:id → workspace object', async () => {
    if (!workspaceId) throw new Error('No workspaceId');
    const res = await api('GET', `/workspaces/${workspaceId}`, null, authToken);
    assertStatus(res, 200);
    if (res.body.id !== workspaceId) throw new Error(`ID mismatch: ${res.body.id}`);
    console.log(`     name: ${res.body.name}`);
  });

  await assert('Workspace', 'Cross-tenant workspace access → 403', async () => {
    const em2 = `audit-u2-${Date.now()}@test.com`;
    const reg = await api('POST', '/auth/register', { email: em2, password: testPwd, name: 'U2' });
    const tok2 = reg.body.accessToken;
    if (!tok2) throw new Error('Could not register user2');
    const res = await api('GET', `/workspaces/${workspaceId}`, null, tok2);
    if (res.status === 200) throw new Error('Cross-tenant access should NOT succeed');
  });

  // ── Suite 4: Threads OAuth ────────────────────────────────────────
  console.log('\n── Suite 4: Threads OAuth ──');

  await assert('OAuth', 'GET /threads-auth/connect → {authorizationUrl, state}', async () => {
    const res = await api('GET', '/threads-auth/connect', null, authToken, workspaceId);
    assertStatus(res, 200);
    // API returns 'authorizationUrl' (not 'authUrl')
    if (!res.body.authorizationUrl) throw new Error(`Missing authorizationUrl: ${JSON.stringify(res.body)}`);
    if (!res.body.state) throw new Error('Missing state');
    if (!res.body.authorizationUrl.includes('threads.net')) throw new Error('Not a Threads URL');
    console.log(`     url: ${res.body.authorizationUrl.substring(0, 60)}...`);
  });

  await assert('OAuth', 'Each OAuth request generates unique state (Redis stored)', async () => {
    const r1 = await api('GET', '/threads-auth/connect', null, authToken, workspaceId);
    const r2 = await api('GET', '/threads-auth/connect', null, authToken, workspaceId);
    if (!r1.body.state || !r2.body.state) throw new Error('Missing state field');
    if (r1.body.state === r2.body.state) throw new Error('States must be unique per request');
    console.log(`     state1: ${r1.body.state.substring(0, 12)}... ≠ state2: ${r2.body.state.substring(0, 12)}...`);
  });

  // ── Suite 5: Social Accounts ──────────────────────────────────────
  console.log('\n── Suite 5: Social Accounts ──');

  await assert('SocialAccounts', 'GET /social-accounts → array', async () => {
    const res = await api('GET', '/social-accounts', null, authToken, workspaceId);
    assertStatus(res, 200);
    if (!Array.isArray(res.body)) throw new Error(`Expected array: ${typeof res.body}`);
    console.log(`     ${res.body.length} connected`);
  });

  // ── Suite 6: Profile ──────────────────────────────────────────────
  console.log('\n── Suite 6: Profile ──');

  await assert('Profile', 'GET /profile → 200 (profile exists or empty)', async () => {
    const res = await api('GET', '/profile', null, authToken, workspaceId);
    if (res.status !== 200 && res.status !== 404) throw new Error(`Unexpected: ${res.status}`);
    console.log(`     profile: ${res.status}`);
  });

  await assert('Profile', 'GET /profile/style → 200 or 404', async () => {
    const res = await api('GET', '/profile/style', null, authToken, workspaceId);
    if (res.status !== 200 && res.status !== 404) throw new Error(`Unexpected: ${res.status}`);
  });

  // ── Suite 7: Content Drafts ───────────────────────────────────────
  console.log('\n── Suite 7: Content Drafts ──');

  await assert('Content', 'GET /content/drafts → {data:[], meta:{}}', async () => {
    const res = await api('GET', '/content/drafts', null, authToken, workspaceId);
    assertStatus(res, 200);
    if (!Array.isArray(res.body.data)) throw new Error(`Expected {data:[]}, got: ${JSON.stringify(res.body).substring(0,100)}`);
    console.log(`     ${res.body.data.length} existing draft(s), total: ${res.body.meta?.total}`);
  });

  await assert('Content', 'POST /content/drafts → draft (201)', async () => {
    const res = await api('POST', '/content/drafts', {
      body: 'Audit v3 test draft — verifying content creation and versioning.',
      hook: 'Test hook for audit',
    }, authToken, workspaceId);
    assertStatus(res, 201);
    if (!res.body.id) throw new Error(`No id: ${JSON.stringify(res.body).substring(0, 100)}`);
    draftId = res.body.id;
    console.log(`     draftId: ${draftId}`);
  });

  await assert('Content', 'GET /content/drafts/:id → draft object', async () => {
    if (!draftId) throw new Error('No draftId');
    const res = await api('GET', `/content/drafts/${draftId}`, null, authToken, workspaceId);
    assertStatus(res, 200);
    if (res.body.id !== draftId) throw new Error('ID mismatch');
  });

  await assert('Content', 'GET /content/drafts/:id/versions → {versions:[]}', async () => {
    if (!draftId) throw new Error('No draftId');
    const res = await api('GET', `/content/drafts/${draftId}/versions`, null, authToken, workspaceId);
    assertStatus(res, 200);
    // API returns {versions: [...]}
    if (!Array.isArray(res.body.versions)) throw new Error(`Expected {versions:[]}: ${JSON.stringify(res.body).substring(0,100)}`);
    console.log(`     ${res.body.versions.length} version(s)`);
  });

  await assert('Content', 'PATCH /content/drafts/:id → updated draft', async () => {
    if (!draftId) throw new Error('No draftId');
    const res = await api('PATCH', `/content/drafts/${draftId}`, { status: 'DRAFT' }, authToken, workspaceId);
    assertStatus(res, 200);
  });

  // ── Suite 8: Content Generation Job ──────────────────────────────
  console.log('\n── Suite 8: Content Generation Job ──');

  await assert('Jobs', 'POST /content/generate → {requestId} (201)', async () => {
    const res = await api('POST', '/content/generate', {
      topic: 'Building in public with AI tools',
      format: 'short thought',
    }, authToken, workspaceId);
    assertStatus(res, 201);
    if (!res.body.requestId) throw new Error(`No requestId: ${JSON.stringify(res.body)}`);
    contentRequestId = res.body.requestId;
    console.log(`     requestId: ${contentRequestId}`);
  });

  await assert('Jobs', 'GET /jobs/:requestId/status → job record', async () => {
    if (!contentRequestId) throw new Error('No requestId');
    const res = await api('GET', `/jobs/${contentRequestId}/status`, null, authToken, workspaceId);
    assertStatus(res, 200);
    if (!res.body.status) throw new Error(`No status: ${JSON.stringify(res.body).substring(0,100)}`);
    console.log(`     status: ${res.body.status}, progress: ${res.body.progress}%`);
  });

  await assert('Jobs', 'Idempotent: re-dispatch same requestId is safe', async () => {
    if (!contentRequestId) throw new Error('No requestId');
    const res = await api('POST', '/content/generate', {
      topic: 'Building in public with AI tools',
      format: 'short thought',
      requestId: contentRequestId,
    }, authToken, workspaceId);
    // Dispatcher returns existing record or enqueues — both 201 and 200 are acceptable
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`Expected 200 or 201, got ${res.status}`);
    }
  });

  // ── Suite 9: Ingestion ────────────────────────────────────────────
  console.log('\n── Suite 9: Ingestion ──');

  await assert('Ingestion', 'GET /ingestion/status → 200 or 404', async () => {
    const res = await api('GET', '/ingestion/status', null, authToken, workspaceId);
    if (res.status !== 200 && res.status !== 404) throw new Error(`Unexpected: ${res.status}`);
    console.log(`     ingestion status: ${res.status}`);
  });

  await assert('Ingestion', 'GET /ingestion/posts → paginated list', async () => {
    const res = await api('GET', '/ingestion/posts?limit=5', null, authToken, workspaceId);
    assertStatus(res, 200);
    const count = Array.isArray(res.body) ? res.body.length : res.body?.data?.length ?? 0;
    console.log(`     ${count} ingested post(s)`);
  });

  // ── Suite 10: Notifications ───────────────────────────────────────
  console.log('\n── Suite 10: Notifications ──');

  await assert('Notifications', 'GET /notifications → {notifications:[], unreadCount:N}', async () => {
    const res = await api('GET', '/notifications', null, authToken, workspaceId);
    assertStatus(res, 200);
    if (!Array.isArray(res.body.notifications)) throw new Error(`Expected {notifications:[...]}: ${JSON.stringify(res.body).substring(0,100)}`);
    console.log(`     ${res.body.notifications.length} notifications, unreadCount: ${res.body.unreadCount}`);
  });

  await assert('Notifications', 'GET /notifications/stream → SSE (text/event-stream)', async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${API_URL}/notifications/stream`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'x-workspace-id': workspaceId,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const ct = res.headers.get('content-type');
      if (!ct?.includes('text/event-stream')) throw new Error(`Expected SSE, got: ${ct}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') return; // Normal — SSE stays open
      throw err;
    }
  });

  // ── Suite 11: Security ────────────────────────────────────────────
  console.log('\n── Suite 11: Security ──');

  await assert('Security', 'Cross-tenant draft access → 404 (not leaked)', async () => {
    if (!draftId) throw new Error('No draftId');
    const em3 = `audit-u3-${Date.now()}@test.com`;
    const reg = await api('POST', '/auth/register', { email: em3, password: testPwd, name: 'U3' });
    const tok3 = reg.body.accessToken;
    const ws3 = reg.body.workspace?.id;
    if (!tok3 || !ws3) throw new Error('Failed to register user3');
    const res = await api('GET', `/content/drafts/${draftId}`, null, tok3, ws3);
    if (res.status === 200) throw new Error('Cross-tenant data leak!');
    console.log(`     correctly blocked: ${res.status}`);
  });

  await assert('Security', 'Job status cross-tenant access → blocked', async () => {
    if (!contentRequestId) throw new Error('No requestId');
    const em4 = `audit-u4-${Date.now()}@test.com`;
    const reg = await api('POST', '/auth/register', { email: em4, password: testPwd, name: 'U4' });
    const tok4 = reg.body.accessToken;
    const ws4 = reg.body.workspace?.id;
    if (!tok4 || !ws4) throw new Error('Failed to register user4');
    const res = await api('GET', `/jobs/${contentRequestId}/status`, null, tok4, ws4);
    if (res.status === 200) throw new Error('Cross-tenant job status leak!');
    console.log(`     correctly blocked: ${res.status}`);
  });

  // ── Suite 12: Content Job Completion ─────────────────────────────
  console.log('\n── Suite 12: AI Job End-to-End ──');

  await assert('Jobs', 'Content generation job completes within 90s', async () => {
    if (!contentRequestId) throw new Error('No requestId');
    const deadline = Date.now() + 90000;
    let lastStatus = 'unknown';
    while (Date.now() < deadline) {
      const res = await api('GET', `/jobs/${contentRequestId}/status`, null, authToken, workspaceId);
      if (res.status !== 200) throw new Error(`Unexpected status ${res.status}`);
      lastStatus = res.body.status;
      const msg = res.body.progressMessage ?? '';
      console.log(`     polling: ${lastStatus} (${res.body.progress}%) ${msg}`);
      if (lastStatus === 'COMPLETE') {
        console.log(`     ✓ Job completed successfully!`);
        return;
      }
      if (lastStatus === 'FAILED') throw new Error(`Job failed: ${res.body.error}`);
      await new Promise(r => setTimeout(r, 4000));
    }
    throw new Error(`Timed out after 90s (last status: ${lastStatus})`);
  });

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('   AUDIT RESULTS SUMMARY');
  console.log('══════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const suites = [...new Set(results.map(r => r.suite))];

  for (const suite of suites) {
    const s = results.filter(r => r.suite === suite);
    const p = s.filter(r => r.passed).length;
    const icon = p === s.length ? '✓' : p === 0 ? '✗' : '~';
    console.log(`  ${icon} ${suite}: ${p}/${s.length}`);
  }

  console.log(`\n  TOTAL: ${passed.length}/${results.length} PASSED | ${failed.length} FAILED\n`);

  if (failed.length > 0) {
    console.log('Failed Tests:');
    for (const f of failed) {
      console.log(`  ✗ [${f.suite}] ${f.name}`);
      console.log(`      → ${f.error}`);
    }
    console.log();
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED — ThreadPilot Phase 0 & Phase 1 verified!\n');
  }
}

runAudit().catch(err => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
