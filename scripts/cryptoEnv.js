const crypto = require('crypto');

const DEFAULT_ITERATIONS = 310000;

function deriveKey(passphrase, salt, iterations = DEFAULT_ITERATIONS) {
  return crypto.pbkdf2Sync(
    Buffer.from(String(passphrase), 'utf8'),
    salt,
    iterations,
    32,
    'sha256'
  );
}

function encryptString(plaintext, passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
  if (!passphrase) throw new Error('Missing passphrase');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt, iterations);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(String(plaintext), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    iterations,
    salt_b64: salt.toString('base64'),
    iv_b64: iv.toString('base64'),
    tag_b64: tag.toString('base64'),
    ciphertext_b64: ciphertext.toString('base64')
  };
}

function decryptToString(payload, passphrase) {
  if (!passphrase) throw new Error('Missing passphrase');
  if (!payload || payload.v !== 1) throw new Error('Unsupported payload');

  const salt = Buffer.from(payload.salt_b64, 'base64');
  const iv = Buffer.from(payload.iv_b64, 'base64');
  const tag = Buffer.from(payload.tag_b64, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext_b64, 'base64');

  const key = deriveKey(passphrase, salt, Number(payload.iterations) || DEFAULT_ITERATIONS);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = {
  encryptString,
  decryptToString
};
