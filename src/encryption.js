import { getSharedSecret } from 'noble-secp256k1';
import { createCipheriv, createDecipheriv, createHash } from 'crypto';
import { hexToBytes, bytesToHex } from './utils.js';

export function encrypt(privkey, pubkey, text) {
  const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
  const encryptionKey = createHash('sha256').update(sharedSecret).digest().slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
  let encryptedMessage = cipher.update(text, 'utf8', 'base64');
  encryptedMessage += cipher.final('base64');
  return encryptedMessage + '?iv=' + iv.toString('base64');
}

export function decrypt(privkey, pubkey, ciphertext) {
  const [emsg, ivBase64] = ciphertext.split('?iv=');
  const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
  const encryptionKey = createHash('sha256').update(sharedSecret).digest().slice(0, 32);
  const decipher = createDecipheriv(
    'aes-256-cbc',
    encryptionKey,
    Buffer.from(ivBase64, 'base64')
  );
  let decryptedMessage = decipher.update(emsg, 'base64', 'utf8');
  decryptedMessage += decipher.final('utf8');
  return decryptedMessage;
}

// Convert hexadecimal string to human-readable string
export function hexToString(hexStr) {
  var str = '';
  for (var i = 0; i < hexStr.length; i += 2)
    str += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
  return str;
}