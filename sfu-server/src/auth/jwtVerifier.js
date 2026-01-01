const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

let cachedKey = null;

function verifyToken(token) {
  if (process.env.JWT_AUTH_DISABLED === 'true') {
    return { sub: 'dev-user', role: 'BROADCASTER' };
  }
  if (!token) {
    throw new Error('Missing token');
  }
  const publicKey = getPublicKey();
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;
  const options = {
    algorithms: ['RS256']
  };
  if (issuer) {
    options.issuer = issuer;
  }
  if (audience) {
    options.audience = audience;
  }
  const claims = jwt.verify(token, publicKey, options);
  if (claims.type !== 'SFU') {
    throw new Error('Invalid token type');
  }
  if (!claims.sub) {
    throw new Error('Missing subject');
  }
  if (!claims.role) {
    throw new Error('Missing role');
  }
  return claims;
}

function getPublicKey() {
  if (cachedKey) {
    return cachedKey;
  }
  const inlineKey = process.env.JWT_PUBLIC_KEY;
  if (inlineKey) {
    cachedKey = normalizeKey(inlineKey);
    return cachedKey;
  }
  const keyPath = process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem';
  if (!keyPath) {
    throw new Error('JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH is required');
  }
  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.join(process.cwd(), keyPath);
  cachedKey = fs.readFileSync(resolvedPath, 'utf8');
  return cachedKey;
}

function normalizeKey(key) {
  if (key.includes('BEGIN PUBLIC KEY')) {
    return key;
  }
  const normalized = key.replace(/\\n/g, '\n');
  return normalized;
}

module.exports = { verifyToken };
