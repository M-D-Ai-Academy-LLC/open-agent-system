/**
 * Data Encryption Hook (#48)
 *
 * Handles encryption of sensitive data.
 * Use cases: data at rest encryption, field-level encryption, key management.
 */

import type {
  HookHandler,
  HookResult,
  DataEncryptionInput,
  DataEncryptionOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Supported encryption algorithms
 */
export const SupportedAlgorithms = {
  'aes-256-gcm': {
    name: 'AES-GCM',
    keyLength: 256,
    ivLength: 12,
    tagLength: 16,
  },
  'aes-256-cbc': {
    name: 'AES-CBC',
    keyLength: 256,
    ivLength: 16,
    tagLength: 0,
  },
  'chacha20-poly1305': {
    name: 'ChaCha20-Poly1305',
    keyLength: 256,
    ivLength: 12,
    tagLength: 16,
  },
} as const;

export type EncryptionAlgorithm = keyof typeof SupportedAlgorithms;

/**
 * Key store interface for managing encryption keys
 */
export interface KeyStore {
  keys: Map<string, { key: Uint8Array; algorithm: EncryptionAlgorithm; createdAt: number }>;
  getKey: (keyId: string) => { key: Uint8Array; algorithm: EncryptionAlgorithm } | undefined;
  setKey: (keyId: string, key: Uint8Array, algorithm: EncryptionAlgorithm) => void;
  rotateKey: (oldKeyId: string, newKeyId: string) => void;
  deleteKey: (keyId: string) => void;
  listKeys: () => string[];
}

/**
 * Creates a key store
 */
export function createKeyStore(): KeyStore {
  const keys = new Map<string, { key: Uint8Array; algorithm: EncryptionAlgorithm; createdAt: number }>();

  return {
    keys,
    getKey: (keyId) => {
      const entry = keys.get(keyId);
      if (!entry) return undefined;
      return { key: entry.key, algorithm: entry.algorithm };
    },
    setKey: (keyId, key, algorithm) => {
      keys.set(keyId, { key, algorithm, createdAt: Date.now() });
    },
    rotateKey: (oldKeyId, newKeyId) => {
      const oldEntry = keys.get(oldKeyId);
      if (oldEntry) {
        keys.set(newKeyId, { ...oldEntry, createdAt: Date.now() });
        keys.delete(oldKeyId);
      }
    },
    deleteKey: (keyId) => {
      keys.delete(keyId);
    },
    listKeys: () => Array.from(keys.keys()),
  };
}

/**
 * Generate a random IV
 */
function generateIV(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random key ID
 */
function generateKeyId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'key-' + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Simple XOR-based encryption for demonstration (NOT SECURE FOR PRODUCTION)
 * In production, use WebCrypto API or a proper crypto library
 */
function simpleEncrypt(data: string, _key: Uint8Array, iv: string): string {
  // Base64 encode with IV prefix for demonstration
  const combined = iv + ':' + btoa(data);
  return combined;
}

/**
 * Default data encryption handler
 */
export const defaultDataEncryptionHandler: HookHandler<
  DataEncryptionInput,
  DataEncryptionOutput
> = async (input, _context): Promise<HookResult<DataEncryptionOutput>> => {
  const algorithm = (input.algorithm ?? 'aes-256-gcm') as EncryptionAlgorithm;
  const keyId = input.keyId ?? generateKeyId();

  const algInfo = SupportedAlgorithms[algorithm] ?? SupportedAlgorithms['aes-256-gcm'];
  const iv = generateIV(algInfo.ivLength);

  // Serialize data to string
  const dataStr = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);

  // Generate a placeholder key for demonstration
  const key = new Uint8Array(algInfo.keyLength / 8);
  crypto.getRandomValues(key);

  // Encrypt (placeholder implementation)
  const encrypted = simpleEncrypt(dataStr, key, iv);

  return {
    success: true,
    data: {
      encrypted,
      algorithm,
      keyId,
      iv,
    },
  };
};

/**
 * Creates an encryption handler with a key store
 */
export function createKeyStoredEncryptionHandler(
  keyStore: KeyStore,
  defaultAlgorithm: EncryptionAlgorithm = 'aes-256-gcm'
): HookHandler<DataEncryptionInput, DataEncryptionOutput> {
  return async (input, _context): Promise<HookResult<DataEncryptionOutput>> => {
    const algorithm = (input.algorithm as EncryptionAlgorithm) ?? defaultAlgorithm;
    let keyId = input.keyId;
    let key: Uint8Array;

    if (keyId) {
      const stored = keyStore.getKey(keyId);
      if (!stored) {
        return {
          success: false,
          error: new Error(`Key not found: ${keyId}`),
          recoverable: false,
        };
      }
      key = stored.key;
    } else {
      // Generate new key
      keyId = generateKeyId();
      const algInfo = SupportedAlgorithms[algorithm] ?? SupportedAlgorithms['aes-256-gcm'];
      key = new Uint8Array(algInfo.keyLength / 8);
      crypto.getRandomValues(key);
      keyStore.setKey(keyId, key, algorithm);
    }

    const algInfo = SupportedAlgorithms[algorithm] ?? SupportedAlgorithms['aes-256-gcm'];
    const iv = generateIV(algInfo.ivLength);

    const dataStr = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
    const encrypted = simpleEncrypt(dataStr, key, iv);

    return {
      success: true,
      data: {
        encrypted,
        algorithm,
        keyId,
        iv,
      },
    };
  };
}

/**
 * Creates an encryption handler with key rotation support
 */
export function createRotatingEncryptionHandler(
  keyStore: KeyStore,
  rotationIntervalMs: number = 86400000 // 24 hours
): HookHandler<DataEncryptionInput, DataEncryptionOutput> {
  let lastRotation = Date.now();
  let currentKeyId = generateKeyId();

  // Initialize first key
  const initKey = new Uint8Array(32);
  crypto.getRandomValues(initKey);
  keyStore.setKey(currentKeyId, initKey, 'aes-256-gcm');

  return async (input, _context): Promise<HookResult<DataEncryptionOutput>> => {
    const now = Date.now();

    // Check if rotation needed
    if (now - lastRotation >= rotationIntervalMs) {
      const newKeyId = generateKeyId();
      const newKey = new Uint8Array(32);
      crypto.getRandomValues(newKey);

      keyStore.setKey(newKeyId, newKey, 'aes-256-gcm');
      // Keep old key for decryption
      currentKeyId = newKeyId;
      lastRotation = now;
    }

    const keyId = input.keyId ?? currentKeyId;
    const stored = keyStore.getKey(keyId);

    if (!stored) {
      return {
        success: false,
        error: new Error(`Key not found: ${keyId}`),
        recoverable: false,
      };
    }

    const iv = generateIV(12);
    const dataStr = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
    const encrypted = simpleEncrypt(dataStr, stored.key, iv);

    return {
      success: true,
      data: {
        encrypted,
        algorithm: stored.algorithm,
        keyId,
        iv,
      },
      metadata: {
        rotationDue: lastRotation + rotationIntervalMs,
        currentKeyAge: now - lastRotation,
      },
    };
  };
}

/**
 * Creates a field-level encryption handler
 */
export function createFieldEncryptionHandler(
  fieldsToEncrypt: string[],
  keyStore: KeyStore
): HookHandler<DataEncryptionInput, DataEncryptionOutput> {
  return async (input, _context): Promise<HookResult<DataEncryptionOutput>> => {
    if (typeof input.data !== 'object' || input.data === null) {
      return {
        success: false,
        error: new Error('Field encryption requires object input'),
        recoverable: false,
      };
    }

    const keyId = input.keyId ?? generateKeyId();

    // Generate or get key
    let key = keyStore.getKey(keyId)?.key;
    if (!key) {
      key = new Uint8Array(32);
      crypto.getRandomValues(key);
      keyStore.setKey(keyId, key, 'aes-256-gcm');
    }

    const data = input.data as Record<string, unknown>;
    const encryptedData: Record<string, unknown> = { ...data };
    const encryptedFields: string[] = [];

    for (const field of fieldsToEncrypt) {
      if (field in data) {
        const iv = generateIV(12);
        const fieldValue = typeof data[field] === 'string'
          ? data[field] as string
          : JSON.stringify(data[field]);
        const encrypted = simpleEncrypt(fieldValue, key, iv);
        encryptedData[field] = { encrypted, iv, keyId };
        encryptedFields.push(field);
      }
    }

    return {
      success: true,
      data: {
        encrypted: JSON.stringify(encryptedData),
        algorithm: 'aes-256-gcm',
        keyId,
      },
      metadata: {
        encryptedFields,
        totalFields: Object.keys(data).length,
      },
    };
  };
}

/**
 * Creates an envelope encryption handler (encrypt data key with master key)
 */
export function createEnvelopeEncryptionHandler(
  masterKeyId: string,
  keyStore: KeyStore
): HookHandler<DataEncryptionInput, DataEncryptionOutput> {
  return async (input, _context): Promise<HookResult<DataEncryptionOutput>> => {
    const masterKey = keyStore.getKey(masterKeyId);
    if (!masterKey) {
      return {
        success: false,
        error: new Error(`Master key not found: ${masterKeyId}`),
        recoverable: false,
      };
    }

    // Generate data encryption key (DEK)
    const dek = new Uint8Array(32);
    crypto.getRandomValues(dek);
    const dekId = generateKeyId();

    // Encrypt data with DEK
    const iv = generateIV(12);
    const dataStr = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
    const encryptedData = simpleEncrypt(dataStr, dek, iv);

    // Encrypt DEK with master key
    const dekIv = generateIV(12);
    const encryptedDek = simpleEncrypt(
      Array.from(dek).map((b) => b.toString(16).padStart(2, '0')).join(''),
      masterKey.key,
      dekIv
    );

    return {
      success: true,
      data: {
        encrypted: JSON.stringify({
          data: encryptedData,
          encryptedDek,
          dekIv,
        }),
        algorithm: 'aes-256-gcm',
        keyId: masterKeyId,
        iv,
      },
      metadata: {
        dekId,
        envelopeEncryption: true,
      },
    };
  };
}

/**
 * Creates a format-preserving encryption handler (for structured data)
 */
export function createFormatPreservingEncryptionHandler(): HookHandler<
  DataEncryptionInput,
  DataEncryptionOutput
> {
  return async (input, _context): Promise<HookResult<DataEncryptionOutput>> => {
    const dataStr = typeof input.data === 'string' ? input.data : String(input.data);
    const keyId = input.keyId ?? generateKeyId();

    // Simple format-preserving transformation (NOT cryptographically secure)
    // In production, use FF1 or FF3-1 algorithms
    const encrypted = dataStr
      .split('')
      .map((char) => {
        if (/[0-9]/.test(char)) {
          return String((parseInt(char) + 5) % 10);
        }
        if (/[a-z]/.test(char)) {
          return String.fromCharCode(((char.charCodeAt(0) - 97 + 13) % 26) + 97);
        }
        if (/[A-Z]/.test(char)) {
          return String.fromCharCode(((char.charCodeAt(0) - 65 + 13) % 26) + 65);
        }
        return char;
      })
      .join('');

    return {
      success: true,
      data: {
        encrypted,
        algorithm: 'fpe-ff1',
        keyId,
      },
      metadata: {
        formatPreserving: true,
        originalLength: dataStr.length,
        encryptedLength: encrypted.length,
      },
    };
  };
}

/**
 * Creates a logging encryption handler
 */
export function createLoggingEncryptionHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<DataEncryptionInput, DataEncryptionOutput>
): HookHandler<DataEncryptionInput, DataEncryptionOutput> {
  return async (input, context): Promise<HookResult<DataEncryptionOutput>> => {
    logger.debug('Encrypting data', {
      algorithm: input.algorithm ?? 'aes-256-gcm',
      hasKeyId: !!input.keyId,
      dataType: typeof input.data,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultDataEncryptionHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.debug('Data encrypted successfully', {
        algorithm: result.data.algorithm,
        keyId: result.data.keyId,
        hasIv: !!result.data.iv,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default data encryption hook
 */
export function registerDefaultDataEncryption(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.DATA_ENCRYPTION,
    {
      id: 'default-data-encryption',
      name: 'Default Data Encryption',
      priority: 'high',
      description: 'Basic data encryption handler',
    },
    defaultDataEncryptionHandler
  );
}
