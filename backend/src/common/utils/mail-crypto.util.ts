import * as crypto from 'crypto';

// ============================================================================
// Chiffrement des mots de passe de boîtes mail (Hostinger IMAP/SMTP)
// AES-256-GCM — clé dérivée de la variable d'environnement MAIL_ENCRYPTION_KEY.
// Format stocké en base : "<iv_hex>:<authTag_hex>:<cipherText_hex>"
// ============================================================================

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = (process.env.MAIL_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    // Fallback de développement — NE PAS utiliser en production.
    // En production, définir MAIL_ENCRYPTION_KEY (32+ caractères) dans l'environnement.
    return crypto.createHash('sha256').update('etcc-mail-dev-fallback-key-change-me').digest();
  }
  // Autoriser une clé de longueur arbitraire → dérivée en 32 octets via SHA-256
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptMailSecret(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptMailSecret(payload: string): string {
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = payload.split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Format de secret mail invalide');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
