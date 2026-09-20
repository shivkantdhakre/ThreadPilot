import { prisma } from '@threadpilot/database';
import { TokenEncryptionService } from '@threadpilot/threads-client';
import Redis from 'ioredis';

const API_URL = 'http://localhost:3001/api/v1';
const WORKER_URL = 'http://localhost:3002';
const redis = new Redis('redis://localhost:6379');

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs?: number;
}

const results: TestResult[] = [];

async function assert(suite: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ suite, name, passed: true, durationMs: Date.now() - start });
    console.log(`  [PASS] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    const error = err?.message || String(err);
    results.push({ suite, name, passed: false, error, durationMs: Date.now() - start });
    console.error(`  [FAIL] ${name} (${Date.now() - start}ms): ${error}`);
  }
}

async function runAudit() {
  console.log('\n======================================================');
  console.log('   THREADPILOT COMPREHENSIVE IMPLEMENTATION AUDIT');
  console.log('======================================================\n');

  // --- SUITE 1: Infrastructure & Health ---
  console.log('--- Suite 1: Infrastructure & Health ---');
  await assert('Infrastructure', 'API Health Check returns ok with DB up', async () => {
    const res = await fetch(`${API_URL}/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok' || data.info?.database?.status !== 'up') {
      throw new Error(`Unexpected health response: ${JSON.stringify(data)}`);
    }
  });

  await assert('Infrastructure', 'Worker Health Check on port 3002 returns ok', async () => {
    const res = await fetch(`${WORKER_URL}/healthz`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Unexpected worker response: ${JSON.stringify(data)}`);
  });

  await assert('Infrastructure', 'Redis connectivity and ping', async () => {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error(`Redis ping failed: ${pong}`);
  });

  // --- SUITE 2: Authentication, Security & Tenant Isolation ---
  console.log('\n--- Suite 2: Authentication, Security & Tenancy ---');
  const timestamp = Date.now();
  const userAEmail = `audit_user_a_${timestamp}@threadpilot.test`;
  const userBEmail = `audit_user_b_${timestamp}@threadpilot.test`;
  const password = 'TestPassword123!Secure';

  let userAToken = '';
  let userARefreshToken = '';
  let userAWorkspaceId = '';
  let userAId = '';

  let userBToken = '';
  let userBWorkspaceId = '';

  await assert('Auth', 'Register new User A (creates user, workspace, profile, prefs)', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password,
        name: 'User A Workspace',
      }),
    });
    if (!res.ok) throw new Error(`Registration failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.accessToken || !data.user?.id || !data.workspace?.id) {
      throw new Error(`Missing tokens or IDs: ${JSON.stringify(data)}`);
    }
    userAToken = data.accessToken;
    userAWorkspaceId = data.workspace.id;
    userAId = data.user.id;

    // Verify DB records
    const profile = await prisma.userProfile.findUnique({ where: { workspaceId: userAWorkspaceId } });
    if (!profile) throw new Error('UserProfile was not created in DB');
    const prefs = await prisma.userPreferences.findUnique({ where: { workspaceId: userAWorkspaceId } });
    if (!prefs) throw new Error('UserPreferences was not created in DB');
  });

  await assert('Auth', 'Register duplicate email rejected with 409 Conflict', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userAEmail, password }),
    });
    if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
  });

  await assert('Auth', 'Register invalid input rejected with 400 Bad Request', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: '123' }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await assert('Auth', 'Login User A with valid credentials', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userAEmail, password }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    if (!data.accessToken) throw new Error('No access token returned');
    userAToken = data.accessToken;
    userARefreshToken = data.refreshToken;
  });

  await assert('Auth', 'Login with invalid password rejected with 401 Unauthorized', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userAEmail, password: 'WrongPassword!' }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await assert('Auth', 'Authenticated GET /auth/me returns User A details', async () => {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (!res.ok) throw new Error(`GET /me failed: ${res.status}`);
    const data = await res.json();
    if (data.email !== userAEmail) throw new Error(`Email mismatch: ${data.email}`);
  });

  await assert('Auth', 'Tampered token rejected with 401 Unauthorized', async () => {
    const tampered = userAToken.substring(0, userAToken.length - 6) + 'abcdef';
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  let successorRefreshToken = '';
  await assert('Auth', 'Refresh token rotation issues new token pair', async () => {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'x-refresh-token': userARefreshToken },
    });
    if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.accessToken) throw new Error('No access token returned on refresh');
    // Read set-cookie for new refresh token
    const cookieHeader = res.headers.get('set-cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/tp_rt=([^;]+)/);
      if (match) successorRefreshToken = match[1];
    }
  });

  await assert('Auth', 'Refresh token reuse detection revokes entire family', async () => {
    // Re-presenting the OLD userARefreshToken should trigger reuse detection and 401
    const res1 = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'x-refresh-token': userARefreshToken },
    });
    if (res1.status !== 401) throw new Error(`Expected 401 on reused token, got ${res1.status}`);

    // Now, even the successor token should be revoked and fail
    if (successorRefreshToken) {
      const res2 = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'x-refresh-token': successorRefreshToken },
      });
      if (res2.status !== 401) throw new Error(`Expected 401 on successor after family revocation, got ${res2.status}`);
    }
  });

  // Re-login User A for remaining tests
  const reLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password }),
  });
  const reLoginData = await reLoginRes.json();
  userAToken = reLoginData.accessToken;

  // Register User B
  await assert('Tenancy', 'Register User B and verify cross-workspace isolation', async () => {
    const resB = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userBEmail, password, name: 'User B Workspace' }),
    });
    const dataB = await resB.json();
    userBToken = dataB.accessToken;
    userBWorkspaceId = dataB.workspace.id;

    // User B attempts to access User A's workspace
    const crossAccessRes = await fetch(`${API_URL}/workspaces/${userAWorkspaceId}`, {
      headers: {
        Authorization: `Bearer ${userBToken}`,
        'x-workspace-id': userAWorkspaceId,
      },
    });
    if (crossAccessRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-workspace access, got ${crossAccessRes.status}`);
    }
  });

  // --- SUITE 3: Workspace API ---
  console.log('\n--- Suite 3: Workspace API ---');
  await assert('Workspace', 'GET /workspaces/:id returns workspace details', async () => {
    const res = await fetch(`${API_URL}/workspaces/${userAWorkspaceId}`, {
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
      },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.id !== userAWorkspaceId) throw new Error(`ID mismatch: ${data.id}`);
  });

  await assert('Workspace', 'PATCH /workspaces/:id updates workspace name', async () => {
    const newName = 'Renamed Workspace A';
    const res = await fetch(`${API_URL}/workspaces/${userAWorkspaceId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.name !== newName) throw new Error(`Name mismatch: ${data.name}`);
  });

  // --- SUITE 4: Threads OAuth, Compliance & Tokens ---
  console.log('\n--- Suite 4: Threads OAuth & Security ---');
  let oauthState = '';
  await assert('Threads OAuth', 'POST /threads-auth/connect returns valid authorizationUrl & state', async () => {
    const res = await fetch(`${API_URL}/threads-auth/connect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
      },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.authorizationUrl || !data.state) {
      throw new Error(`Missing authorizationUrl or state: ${JSON.stringify(data)}`);
    }
    oauthState = data.state;
    // Verify stored in Redis
    const tx = await redis.get(`oauth-tx:${oauthState}`);
    if (!tx) throw new Error('Transaction was not stored in Redis');
    const parsed = JSON.parse(tx);
    if (parsed.workspaceId !== userAWorkspaceId) {
      throw new Error(`Workspace ID mismatch in Redis: ${parsed.workspaceId}`);
    }
  });

  await assert('Threads OAuth', 'Callback with invalid or missing state returns 400', async () => {
    const res = await fetch(`${API_URL}/threads-auth/callback?code=fake_code&state=non_existent_state`);
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await assert('Threads OAuth', 'POST /threads-auth/uninstall returns 200 OK', async () => {
    const res = await fetch(`${API_URL}/threads-auth/uninstall`, { method: 'POST' });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await assert('Threads OAuth', 'POST /threads-auth/delete returns 200 OK with confirmation', async () => {
    const res = await fetch(`${API_URL}/threads-auth/delete`, { method: 'POST' });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.confirmation_code) throw new Error('Missing confirmation_code');
  });

  await assert('Security', 'TokenEncryptionService AES-256-GCM encryption & decryption', async () => {
    const encService = new TokenEncryptionService('KO2lqxwE+NZSmGpaXFIYbU/m74Duqng6zg41R5x9Q0E=', 1);
    const testSecret = 'TH_OAUTH_TOKEN_TEST_SECRET_12345';
    const encrypted = encService.encrypt(testSecret);
    if (!encrypted.startsWith('v1:')) throw new Error(`Missing key version prefix: ${encrypted}`);
    const decrypted = encService.decrypt(encrypted);
    if (decrypted !== testSecret) throw new Error(`Decrypted string mismatch: ${decrypted}`);
  });

  // --- SUITE 5: Profile & Preferences ---
  console.log('\n--- Suite 5: Profile & Preferences ---');
  await assert('Profile', 'GET /profile returns profile structure', async () => {
    const res = await fetch(`${API_URL}/profile`, {
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
      },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.workspaceId !== userAWorkspaceId) throw new Error('Workspace ID mismatch');
  });

  await assert('Profile', 'PATCH /profile updates profession & bio', async () => {
    const res = await fetch(`${API_URL}/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profession: 'AI Automation Engineer',
        bio: 'Building autonomous social agents.',
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.profession !== 'AI Automation Engineer') throw new Error(`Profession mismatch: ${data.profession}`);
  });

  await assert('Profile', 'PATCH /profile/preferences updates topics & formats', async () => {
    const res = await fetch(`${API_URL}/profile/preferences`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredTopics: ['AI', 'Tech', 'Engineering'],
        preferredFormats: ['QUICK_HIT', 'STORY'],
        preferredTimezone: 'America/New_York',
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (!data.preferredTopics?.includes('AI')) throw new Error('Topic not updated');
  });

  await assert('Profile', 'GET /profile/style and GET /profile/style/examples return array', async () => {
    const res1 = await fetch(`${API_URL}/profile/style`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res1.ok) throw new Error(`GET /style failed: ${res1.status}`);
    const data1 = await res1.json();
    if (!Array.isArray(data1)) throw new Error('Expected array from /style');

    const res2 = await fetch(`${API_URL}/profile/style/examples`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res2.ok) throw new Error(`GET /style/examples failed: ${res2.status}`);
  });

  // --- SUITE 6: Content & Drafts CRUD & Versioning ---
  console.log('\n--- Suite 6: Content & Drafts Lifecycle ---');
  let createdDraftId = '';
  await assert('Content', 'POST /content/drafts creates manual draft with v1', async () => {
    const res = await fetch(`${API_URL}/content/drafts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Initial draft post text testing automated content pipeline.',
        hook: 'Did you know?',
        cta: 'Share your thoughts below!',
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.id) throw new Error('No draft ID returned');
    createdDraftId = data.id;
  });

  await assert('Content', 'GET /content/drafts lists drafts with pagination', async () => {
    const res = await fetch(`${API_URL}/content/drafts?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.data) || data.data.length === 0) throw new Error('Expected draft array');
    if (data.meta.total < 1) throw new Error('Total count mismatch');
  });

  await assert('Content', 'GET /content/drafts/:id returns draft with versions', async () => {
    const res = await fetch(`${API_URL}/content/drafts/${createdDraftId}`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.id !== createdDraftId || !Array.isArray(data.versions)) {
      throw new Error(`Invalid draft response: ${JSON.stringify(data)}`);
    }
  });

  await assert('Content', 'POST /content/drafts/:id/versions creates v2', async () => {
    const res = await fetch(`${API_URL}/content/drafts/${createdDraftId}/versions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Version 2: Polished copy with higher engagement hooks.',
        diffSummary: 'Polished hooks and brevity.',
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.version !== 2) throw new Error(`Expected version 2, got ${data.version}`);
  });

  await assert('Content', 'GET /content/drafts/:id/versions returns all versions', async () => {
    const res = await fetch(`${API_URL}/content/drafts/${createdDraftId}/versions`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.versions) || data.versions.length !== 2) {
      throw new Error(`Expected 2 versions, got ${data.versions?.length}`);
    }
  });

  await assert('Content', 'PATCH /content/drafts/:id updates status to APPROVED', async () => {
    const res = await fetch(`${API_URL}/content/drafts/${createdDraftId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.status !== 'APPROVED') throw new Error(`Status mismatch: ${data.status}`);
  });

  await assert('Content', 'DELETE /content/drafts/:id removes the draft', async () => {
    const res = await fetch(`${API_URL}/content/drafts/${createdDraftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);

    // Verify deleted
    const checkRes = await fetch(`${API_URL}/content/drafts/${createdDraftId}`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (checkRes.status !== 404) throw new Error(`Expected 404, got ${checkRes.status}`);
  });

  // --- SUITE 7: Notifications ---
  console.log('\n--- Suite 7: Notifications ---');
  let testNotificationId = '';
  await assert('Notifications', 'Create and retrieve notification', async () => {
    const notif = await prisma.notification.create({
      data: {
        workspaceId: userAWorkspaceId,
        type: 'SYSTEM',
        title: 'Audit Test Notification',
        body: 'Automated test notification content.',
      },
    });
    testNotificationId = notif.id;

    const res = await fetch(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.notifications) || data.notifications.length === 0) {
      throw new Error('No notifications returned');
    }
  });

  await assert('Notifications', 'PATCH /notifications/:id/read marks notification as read', async () => {
    const res = await fetch(`${API_URL}/notifications/${testNotificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (!data.read) throw new Error('Notification read status not true');
  });

  await assert('Notifications', 'POST /notifications/read-all marks all notifications read', async () => {
    const res = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
  });

  // --- SUITE 8: AI Content Generation & Idempotency ---
  console.log('\n--- Suite 8: AI Content Generation & Idempotency ---');
  const genRequestId = `audit_gen_${timestamp}`;
  await assert('AI & Jobs', 'POST /content/generate enqueues job and creates JobRecord', async () => {
    const res = await fetch(`${API_URL}/content/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: 'Why developers should automate their social presence',
        format: 'QUICK_HIT',
        requestId: genRequestId,
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (data.requestId !== genRequestId) throw new Error(`RequestId mismatch: ${data.requestId}`);

    // Verify JobRecord exists in DB
    const jobRecord = await prisma.jobRecord.findUnique({ where: { requestId: genRequestId } });
    if (!jobRecord) throw new Error('JobRecord not found in Postgres');
    if (jobRecord.workspaceId !== userAWorkspaceId) throw new Error('JobRecord workspace mismatch');
  });

  await assert('AI & Jobs', 'GET /jobs/:requestId/status returns job record status', async () => {
    const res = await fetch(`${API_URL}/jobs/${genRequestId}/status`, {
      headers: { Authorization: `Bearer ${userAToken}`, 'x-workspace-id': userAWorkspaceId },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.requestId !== genRequestId) throw new Error(`Status requestId mismatch: ${data.requestId}`);
  });

  await assert('AI & Jobs', 'Idempotency: re-calling generate with same requestId returns existing job', async () => {
    const res = await fetch(`${API_URL}/content/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'x-workspace-id': userAWorkspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: 'Duplicate call test',
        requestId: genRequestId,
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    if (data.requestId !== genRequestId) throw new Error('RequestId mismatch on idempotent call');

    // Verify only ONE jobRecord exists with this requestId
    const count = await prisma.jobRecord.count({ where: { requestId: genRequestId } });
    if (count !== 1) throw new Error(`Expected exactly 1 JobRecord, found ${count}`);
  });

  // --- SUITE 9: Database Vector Search (pgvector) ---
  console.log('\n--- Suite 9: Database & Vector Search ---');
  await assert('Database', 'pgvector extension & memory_embeddings table verified', async () => {
    const result: any = await prisma.$queryRaw`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'memory_embeddings' AND column_name = 'embedding';
    `;
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error('embedding column not found on memory_embeddings table');
    }
    if (result[0].udt_name !== 'vector') {
      throw new Error(`Expected udt_name 'vector', got ${result[0].udt_name}`);
    }
  });

  // Cleanup test users
  console.log('\n--- Cleaning up audit test data ---');
  try {
    await prisma.user.deleteMany({
      where: { email: { in: [userAEmail, userBEmail] } },
    });
    console.log('Test users cleaned up successfully.');
  } catch (err) {
    console.warn('Cleanup warning:', err);
  }

  await redis.quit();

  // Summary
  console.log('\n======================================================');
  console.log('   AUDIT TEST SUMMARY');
  console.log('======================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
