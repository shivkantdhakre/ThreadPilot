import 'dotenv/config';
import { PrismaClient } from '@threadpilot/database';
import Redis from 'ioredis';

const errors = [];
const warnings = [];
const passes = [];

function pass(name, detail = '') {
  passes.push(`[PASS] ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, reason) {
  errors.push(`[FAIL] ${name}: ${reason}`);
}

function warn(name, reason) {
  warnings.push(`[WARN] ${name}: ${reason}`);
}

function maskSecret(val) {
  if (!val) return '<empty>';
  if (val.length <= 8) return '********';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

console.log('====================================================');
console.log('      THREADPILOT PRODUCTION PREFLIGHT VERIFIER    ');
console.log('====================================================\n');

// 1. Environment & Mode
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === 'production') {
  pass('NODE_ENV', 'production');
} else {
  fail('NODE_ENV', `Expected 'production', got '${nodeEnv || '<unset>'}'`);
}

// 2. Split Subdomain & HTTPS Contract
const urls = {
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
  API_PUBLIC_URL: process.env.API_PUBLIC_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  THREADS_REDIRECT_URI: process.env.THREADS_REDIRECT_URI,
};

for (const [key, value] of Object.entries(urls)) {
  if (!value) {
    fail(key, 'Environment variable is not set');
    continue;
  }
  if (!value.startsWith('https://')) {
    fail(key, `Must use HTTPS protocol in production. Got: '${value}'`);
  } else if (/localhost|127\.0\.0\.1|ngrok|trycloudflare\.com/i.test(value)) {
    fail(key, `Contains local or ephemeral host string: '${value}'`);
  } else {
    pass(key, value);
  }
}

// 3. Exact OAuth Callback Alignment
if (urls.API_PUBLIC_URL && urls.THREADS_REDIRECT_URI) {
  const expectedCallback = `${urls.API_PUBLIC_URL.replace(/\/+$/, '')}/api/v1/threads-auth/callback`;
  if (urls.THREADS_REDIRECT_URI === expectedCallback) {
    pass('THREADS_REDIRECT_URI Contract', `Matches exact API origin: ${expectedCallback}`);
  } else {
    fail(
      'THREADS_REDIRECT_URI Contract',
      `Mismatch: THREADS_REDIRECT_URI is '${urls.THREADS_REDIRECT_URI}', but expected '${expectedCallback}'`
    );
  }
}

// 4. CORS Origin Check
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  fail('CORS_ORIGIN', 'CORS_ORIGIN is not defined.');
} else {
  const allowed = corsOrigin.split(',').map((s) => s.trim().replace(/\/+$/, ''));
  const appOrigin = urls.APP_PUBLIC_URL ? urls.APP_PUBLIC_URL.replace(/\/+$/, '') : '';
  if (appOrigin && !allowed.includes(appOrigin)) {
    fail('CORS_ORIGIN', `CORS_ORIGIN ('${corsOrigin}') does not contain APP_PUBLIC_URL ('${appOrigin}')`);
  } else {
    pass('CORS_ORIGIN', `Permits web origin (${corsOrigin})`);
  }
}

// 5. Shared Cookie Domain
const cookieDomain = process.env.JWT_REFRESH_COOKIE_DOMAIN;
if (!cookieDomain) {
  fail('JWT_REFRESH_COOKIE_DOMAIN', 'Must be set for split-subdomain authentication');
} else if (!cookieDomain.startsWith('.')) {
  fail('JWT_REFRESH_COOKIE_DOMAIN', `Must start with a leading dot for wildcard subdomains (e.g. '.yourdomain.com'). Got '${cookieDomain}'`);
} else if (cookieDomain.includes(':') || cookieDomain.includes('http')) {
  fail('JWT_REFRESH_COOKIE_DOMAIN', `Invalid cookie domain format: '${cookieDomain}'`);
} else {
  pass('JWT_REFRESH_COOKIE_DOMAIN', cookieDomain);
}

// 6. Security Keys & Secrets Hygiene
const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
if (!tokenEncryptionKey) {
  fail('TOKEN_ENCRYPTION_KEY', 'Key is not defined');
} else {
  try {
    const buf = Buffer.from(tokenEncryptionKey, 'base64');
    if (buf.length === 32) {
      pass('TOKEN_ENCRYPTION_KEY', 'Valid 256-bit base64 AES key');
    } else {
      fail('TOKEN_ENCRYPTION_KEY', `Key decoded to ${buf.length} bytes; must be exactly 32 bytes (256 bits)`);
    }
  } catch (err) {
    fail('TOKEN_ENCRYPTION_KEY', `Failed to parse base64 key: ${err.message}`);
  }
}

const accessSecret = process.env.JWT_ACCESS_SECRET;
if (!accessSecret || accessSecret.length < 32) {
  fail('JWT_ACCESS_SECRET', `Minimum 32 characters required (current length: ${accessSecret ? accessSecret.length : 0})`);
} else {
  pass('JWT_ACCESS_SECRET', `Entropy OK (${accessSecret.length} chars, masked: ${maskSecret(accessSecret)})`);
}

const refreshSecret = process.env.JWT_REFRESH_SECRET;
if (!refreshSecret || refreshSecret.length < 32) {
  fail('JWT_REFRESH_SECRET', `Minimum 32 characters required (current length: ${refreshSecret ? refreshSecret.length : 0})`);
} else {
  pass('JWT_REFRESH_SECRET', `Entropy OK (${refreshSecret.length} chars, masked: ${maskSecret(refreshSecret)})`);
}

// 7. Backup Public Key Hygiene
const ageRecipient = process.env.AGE_RECIPIENT_PUBKEY;
if (!ageRecipient) {
  warn('AGE_RECIPIENT_PUBKEY', 'Public key not set (required on OCI VM for unattended daily backup)');
} else if (!ageRecipient.startsWith('age1')) {
  fail('AGE_RECIPIENT_PUBKEY', `Invalid age public key format (must start with 'age1'). Got: ${ageRecipient.slice(0, 8)}...`);
} else {
  pass('AGE_RECIPIENT_PUBKEY', `Valid age recipient key: ${maskSecret(ageRecipient)}`);
}

// 8. Meta Threads App Credentials
const threadsAppId = process.env.THREADS_APP_ID;
const threadsAppSecret = process.env.THREADS_APP_SECRET;
if (!threadsAppId || threadsAppId.includes('your_')) {
  fail('THREADS_APP_ID', 'Missing or default placeholder value');
} else {
  pass('THREADS_APP_ID', `Configured (${threadsAppId})`);
}

if (!threadsAppSecret || threadsAppSecret.includes('your_')) {
  fail('THREADS_APP_SECRET', 'Missing or default placeholder value');
} else {
  pass('THREADS_APP_SECRET', `Configured (${maskSecret(threadsAppSecret)})`);
}

// 9. Live Connectivity Verification (Neon Pooled, Neon Unpooled, Redis)
const skipConnectivity = process.argv.includes('--skip-connectivity');

async function checkConnectivity() {
  if (skipConnectivity) {
    warn('Connectivity Checks', 'Skipped via --skip-connectivity flag');
    return;
  }

  // Pooled DB check
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    fail('DATABASE_URL', 'DATABASE_URL is not set');
  } else {
    try {
      const prismaClient = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      await prismaClient.$queryRaw`SELECT 1`;
      await prismaClient.$disconnect();
      pass('Neon Pooled DB Connectivity', 'Connected and executed SELECT 1');
    } catch (err) {
      fail('Neon Pooled DB Connectivity', `Failed to connect via DATABASE_URL: ${err.message}`);
    }
  }

  // Unpooled DB check
  const dbUnpooledUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!dbUnpooledUrl) {
    warn('DATABASE_URL_UNPOOLED', 'Not configured (required for migration container & pg_dump backups)');
  } else {
    try {
      const prismaUnpooled = new PrismaClient({ datasources: { db: { url: dbUnpooledUrl } } });
      await prismaUnpooled.$queryRaw`SELECT 1`;
      await prismaUnpooled.$disconnect();
      pass('Neon Unpooled DB Connectivity', 'Connected directly and executed SELECT 1');
    } catch (err) {
      fail('Neon Unpooled DB Connectivity', `Failed to connect via DATABASE_URL_UNPOOLED: ${err.message}`);
    }
  }

  // Redis connectivity check
  const redisUrl = process.env.REDIS_URL_LOCAL ?? process.env.REDIS_URL;
  if (!redisUrl) {
    fail('REDIS_URL', 'REDIS_URL is not set');
  } else {
    try {
      const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      redis.on('error', () => {}); // Prevent unhandled event
      await redis.connect();
      const pingRes = await redis.ping();
      await redis.quit();
      pass('Redis Connectivity', `PING returned '${pingRes}'`);
    } catch (err) {
      fail('Redis Connectivity', `Failed to connect to Redis: ${err.message}`);
    }
  }
}

checkConnectivity().then(() => {
  console.log('\n====================================================');
  console.log('               PREFLIGHT SUMMARY                    ');
  console.log('====================================================');
  passes.forEach((p) => console.log(p));
  warnings.forEach((w) => console.log(w));
  errors.forEach((e) => console.log(e));

  console.log('----------------------------------------------------');
  console.log(`Total Checks: ${passes.length + warnings.length + errors.length} | Passed: ${passes.length} | Warnings: ${warnings.length} | Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.error('\n>>> STATUS: PREFLIGHT FAILED. RESOLVE ALL ERRORS BEFORE PRODUCTION DEPLOYMENT. <<<');
    process.exit(1);
  } else {
    console.log('\n>>> STATUS: PREFLIGHT PASSED. ENVIRONMENT MEETS PRODUCTION INVARIANTS. <<<');
    process.exit(0);
  }
});
