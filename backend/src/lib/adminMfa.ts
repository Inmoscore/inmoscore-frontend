import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verifySync } from 'otplib';

const MFA_ISSUER = 'InmoScore';
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export type BackupCodeHash = {
  id: string;
  hash: string;
  created_at: string;
};

function getEncryptionKey(): Buffer {
  const rawKey = process.env.MFA_SECRET_ENCRYPTION_KEY;

  if (!rawKey || rawKey.trim().length < 16) {
    throw new Error('MFA_SECRET_ENCRYPTION_KEY is not configured');
  }

  const trimmed = rawKey.trim();
  const maybeBase64 = Buffer.from(trimmed, 'base64');

  if (maybeBase64.length === 32 && maybeBase64.toString('base64').replace(/=+$/, '') === trimmed.replace(/=+$/, '')) {
    return maybeBase64;
  }

  return crypto.createHash('sha256').update(trimmed).digest();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTotpToken(token: string): string {
  return token.replace(/\s+/g, '').trim();
}

export function generateTotpSecret(_email: string): string {
  return generateSecret();
}

export function buildOtpauthUri(email: string, secret: string): string {
  return generateURI({
    strategy: 'totp',
    issuer: MFA_ISSUER,
    label: normalizeEmail(email),
    secret,
    digits: 6,
    period: 30,
  });
}

export function verifyTotpToken(secret: string, token: string): boolean {
  const normalizedToken = normalizeTotpToken(token);

  if (!/^\d{6}$/.test(normalizedToken)) {
    return false;
  }

  const result = verifySync({
    strategy: 'totp',
    secret,
    token: normalizedToken,
    digits: 6,
    period: 30,
    epochTolerance: 1,
  });

  return Boolean(result.valid);
}

export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase().match(/.{1,5}/g)?.join('-') || ''
  );
}

export async function hashBackupCode(code: string): Promise<BackupCodeHash> {
  const normalizedCode = normalizeBackupCode(code);
  const hash = await bcrypt.hash(normalizedCode, 12);

  return {
    id: crypto.randomUUID(),
    hash,
    created_at: new Date().toISOString(),
  };
}

export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]+/g, '').trim().toUpperCase();
}

export async function verifyBackupCode(
  code: string,
  hashes: BackupCodeHash[] | null | undefined
): Promise<{ valid: boolean; index: number | null }> {
  const normalizedCode = normalizeBackupCode(code);

  if (!normalizedCode || !Array.isArray(hashes) || hashes.length === 0) {
    return { valid: false, index: null };
  }

  for (let index = 0; index < hashes.length; index += 1) {
    const entry = hashes[index];
    if (entry?.hash && (await bcrypt.compare(normalizedCode, entry.hash))) {
      return { valid: true, index };
    }
  }

  return { valid: false, index: null };
}

export function encryptMfaSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptMfaSecret(encrypted: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = encrypted.split('.');

  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Invalid encrypted MFA secret');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(ivRaw, 'base64')
  );

  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
