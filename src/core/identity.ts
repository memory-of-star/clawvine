import * as paillier from 'paillier-bigint';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import {
  type AgentIdentity,
  type StoredIdentity,
  type SerializedPaillierPublicKey,
  type SerializedPaillierPrivateKey,
} from '../types.js';
import { loadIdentity, saveIdentity } from './config.js';

function serializePaillierPublic(key: paillier.PublicKey): SerializedPaillierPublicKey {
  return {
    n: key.n.toString(16),
    g: key.g.toString(16),
  };
}

function serializePaillierPrivate(key: paillier.PrivateKey): SerializedPaillierPrivateKey {
  return {
    lambda: key.lambda.toString(16),
    mu: key.mu.toString(16),
    n: key.publicKey.n.toString(16),
    g: key.publicKey.g.toString(16),
  };
}

export function deserializePaillierPublic(s: SerializedPaillierPublicKey): paillier.PublicKey {
  return new paillier.PublicKey(BigInt('0x' + s.n), BigInt('0x' + s.g));
}

export function deserializePaillierPrivate(s: SerializedPaillierPrivateKey): paillier.PrivateKey {
  const pub = new paillier.PublicKey(BigInt('0x' + s.n), BigInt('0x' + s.g));
  return new paillier.PrivateKey(BigInt('0x' + s.lambda), BigInt('0x' + s.mu), pub);
}

export async function generateIdentity(heKeyBits: number): Promise<AgentIdentity> {
  const nostrSk = generateSecretKey();
  const nostrPk = getPublicKey(nostrSk);

  const { publicKey, privateKey } = await paillier.generateRandomKeys(heKeyBits);

  return {
    nostrSecretKey: nostrSk,
    nostrPublicKey: nostrPk,
    hePublicKey: serializePaillierPublic(publicKey),
    hePrivateKey: serializePaillierPrivate(privateKey),
  };
}

export function storeIdentity(identity: AgentIdentity): void {
  const stored: StoredIdentity = {
    nostrSecretKeyHex: bytesToHex(identity.nostrSecretKey),
    nostrPublicKeyHex: identity.nostrPublicKey,
    hePublicKey: identity.hePublicKey,
    hePrivateKey: identity.hePrivateKey,
  };
  saveIdentity(stored);
}

export function restoreIdentity(): AgentIdentity | null {
  const stored = loadIdentity();
  if (!stored) return null;
  return {
    nostrSecretKey: hexToBytes(stored.nostrSecretKeyHex),
    nostrPublicKey: stored.nostrPublicKeyHex,
    hePublicKey: stored.hePublicKey,
    hePrivateKey: stored.hePrivateKey,
  };
}

export function getNpub(publicKeyHex: string): string {
  return npubEncode(publicKeyHex);
}
