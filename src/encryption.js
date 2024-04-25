import { bytesToHex, randomBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1'
import { cbc } from '@noble/ciphers/aes';
import { base64 } from '@scure/base';
import { nip04 } from 'nostr-tools';

export async function encrypt(secretKey, pubkey, text) {
  try {
    const key = nip04.getSharedSecret(secretKey, pubkey);
    const normalizedKey = getNormalizedX(key);

    let iv = Uint8Array.from(randomBytes(16));
    let plaintext = utf8Encoder.encode(text);
    let ciphertext = cbc(normalizedKey, iv).encrypt(plaintext);

    let ctb64 = base64.encode(new Uint8Array(ciphertext));
    let ivb64 = base64.encode(new Uint8Array(iv.buffer));

    return `${ctb64}?iv=${ivb64}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt the message");
  }
}

export async function decrypt(secretKey, pubkey, data) {
  let [ctb64, ivb64] = data.split('?iv=');

  let key = nip04.getSharedSecret(secretKey, pubkey);
  let normalizedKey = getNormalizedX(key);

  let iv = base64.decode(ivb64);
  let ciphertext = base64.decode(ctb64);
  let plaintext = cbc(normalizedKey, iv).decrypt(ciphertext);

  return utf8Decoder.decode(plaintext);
}

export function getNormalizedX(key) {
  return key.slice(1, 33);
}
