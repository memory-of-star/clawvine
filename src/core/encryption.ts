/**
 * Paillier Homomorphic Encryption for privacy-preserving vector similarity.
 *
 * Protocol:
 *   1. Agent A normalizes interest vector, scales to integers, encrypts with own public key
 *   2. Agent A sends encrypted vector + public key to Agent B
 *   3. Agent B computes encrypted dot product using plaintext-ciphertext operations
 *   4. Agent B returns single encrypted score to Agent A
 *   5. Agent A decrypts to get cosine similarity — B never sees A's vector
 */

import * as paillier from 'paillier-bigint';
import type { SerializedPaillierPublicKey } from '../types.js';
import { deserializePaillierPublic } from './identity.js';

const SCALE = 1_000_000n;
const SCALE_SQ = SCALE * SCALE;

function floatToBigInt(value: number, n: bigint): bigint {
  const scaled = BigInt(Math.round(value * Number(SCALE)));
  // Represent negative values in Z_n
  return scaled >= 0n ? scaled : n + scaled;
}

function bigIntToFloat(value: bigint, n: bigint): number {
  // If value > n/2, it represents a negative number
  const half = n / 2n;
  const actual = value > half ? value - n : value;
  return Number(actual) / Number(SCALE_SQ);
}

export function encryptVector(
  vector: number[],
  publicKey: paillier.PublicKey,
): bigint[] {
  return vector.map((v) => publicKey.encrypt(floatToBigInt(v, publicKey.n)));
}

export function serializeEncryptedVector(encrypted: bigint[]): string[] {
  return encrypted.map((c) => c.toString(16));
}

export function deserializeEncryptedVector(hex: string[]): bigint[] {
  return hex.map((h) => BigInt('0x' + h));
}

/**
 * Compute encrypted dot product: Enc(va · vb).
 * Executed by the RECEIVER (Agent B) using Agent A's public key
 * and B's own plaintext vector. B never sees A's raw vector.
 */
export function computeEncryptedDotProduct(
  encryptedVa: bigint[],
  plaintextVb: number[],
  senderPublicKey: paillier.PublicKey,
): bigint {
  if (encryptedVa.length !== plaintextVb.length) {
    throw new Error(`Vector dimension mismatch: ${encryptedVa.length} vs ${plaintextVb.length}`);
  }

  const n = senderPublicKey.n;
  const products: bigint[] = [];

  for (let i = 0; i < encryptedVa.length; i++) {
    const vb_scaled = floatToBigInt(plaintextVb[i], n);
    // Enc(va_i) ^ vb_i mod n^2 = Enc(va_i * vb_i)
    const product = senderPublicKey.multiply(encryptedVa[i], vb_scaled);
    products.push(product);
  }

  // Enc(va_0*vb_0) * Enc(va_1*vb_1) * ... = Enc(sum(va_i*vb_i))
  return senderPublicKey.addition(...products);
}

/**
 * Decrypt the dot product score. Executed by the SENDER (Agent A).
 */
export function decryptScore(
  encryptedScore: bigint,
  privateKey: paillier.PrivateKey,
): number {
  const raw = privateKey.decrypt(encryptedScore);
  return bigIntToFloat(raw, privateKey.publicKey.n);
}

/**
 * L2-normalize a vector so dot product equals cosine similarity.
 */
export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector.map(() => 0);
  return vector.map((v) => v / norm);
}

/**
 * Convenience: encrypt a normalized interest vector for gossip transmission.
 */
export function prepareGossipVector(
  rawVector: number[],
  publicKey: paillier.PublicKey,
): { encrypted: bigint[]; serialized: string[] } {
  const normalized = normalizeVector(rawVector);
  const encrypted = encryptVector(normalized, publicKey);
  return { encrypted, serialized: serializeEncryptedVector(encrypted) };
}

/**
 * Convenience: handle an incoming gossip request — compute similarity and return encrypted score.
 */
export function handleGossipRequest(
  incomingEncryptedHex: string[],
  senderPubKeySerialized: SerializedPaillierPublicKey,
  ownRawVector: number[],
): string {
  const encryptedVa = deserializeEncryptedVector(incomingEncryptedHex);
  const senderPubKey = deserializePaillierPublic(senderPubKeySerialized);
  const normalizedOwn = normalizeVector(ownRawVector);
  const encScore = computeEncryptedDotProduct(encryptedVa, normalizedOwn, senderPubKey);
  return encScore.toString(16);
}
