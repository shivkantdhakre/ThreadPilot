import crypto from 'node:crypto';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (let p = 0; p < values.length; ++p) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[p];
    for (let i = 0; i < 5; ++i) {
      if ((top >> i) & 1) {
        chk ^= GEN[i];
      }
    }
  }
  return chk;
}

function hrpExpand(hrp) {
  const ret = [];
  for (let p = 0; p < hrp.length; ++p) {
    ret.push(hrp.charCodeAt(p) >> 5);
  }
  ret.push(0);
  for (let p = 0; p < hrp.length; ++p) {
    ret.push(hrp.charCodeAt(p) & 31);
  }
  return ret;
}

function createChecksum(hrp, data) {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = polymod(values) ^ 1;
  const ret = [];
  for (let p = 0; p < 6; ++p) {
    ret.push((mod >> (5 * (5 - p))) & 31);
  }
  return ret;
}

function convertBits(data, frombits, tobits, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << tobits) - 1;
  for (let p = 0; p < data.length; ++p) {
    const value = data[p];
    acc = (acc << frombits) | value;
    bits += frombits;
    while (bits >= tobits) {
      bits -= tobits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (tobits - bits)) & maxv);
  }
  return ret;
}

function encodeBech32(hrp, data) {
  const combined = data.concat(createChecksum(hrp, data));
  let ret = hrp + '1';
  for (let p = 0; p < combined.length; ++p) {
    ret += CHARSET.charAt(combined[p]);
  }
  return ret;
}

// 1. AES Token Encryption Key (32 bytes / 256 bits)
const tokenKey = crypto.randomBytes(32).toString('base64');

// 2. JWT Secrets (64 characters / 256 bits entropy)
const jwtAccess = crypto.randomBytes(32).toString('hex');
const jwtRefresh = crypto.randomBytes(32).toString('hex');

// 3. Asymmetric age X25519 Keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
const pubBytes = Array.from(publicKey.export({ type: 'spki', format: 'der' }).subarray(12));
const privBytes = Array.from(privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16));

const pub5 = convertBits(pubBytes, 8, 5, true);
const priv5 = convertBits(privBytes, 8, 5, true);

const ageRecipient = encodeBech32('age', pub5);
const ageIdentity = encodeBech32('age-secret-key-', priv5).toUpperCase();

console.log('================================================================');
console.log('            THREADPILOT PRODUCTION SECRETS GENERATOR            ');
console.log('================================================================\n');

console.log('# ── Paste into .env.production / Cloud Host Variables ──────────');
console.log(`TOKEN_ENCRYPTION_KEY=${tokenKey}`);
console.log(`TOKEN_ENCRYPTION_KEY_VERSION=1`);
console.log(`JWT_ACCESS_SECRET=${jwtAccess}`);
console.log(`JWT_REFRESH_SECRET=${jwtRefresh}`);
console.log(`AGE_RECIPIENT_PUBKEY=${ageRecipient}`);

console.log('\n# ── PRIVATE DECRYPTION SECRET (Store in Password Manager ONLY!) ─');
console.log(`AGE_SECRET_KEY=${ageIdentity}\n`);
console.log('================================================================');
