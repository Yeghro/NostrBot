import { getSharedSecret } from 'noble-secp256k1';
import { createCipheriv } from 'crypto';

export function encrypt(privkey, pubkey, text) {
  const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
  const encryptionKey = Buffer.from(sharedSecret.slice(1, 33));  // Use only the X coordinate, directly.
  const iv = crypto.randomBytes(16);  // Generate a random IV.
  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
  let encryptedMessage = cipher.update(text, 'utf8', 'base64');
  encryptedMessage += cipher.final('base64');
  return encryptedMessage + '?iv=' + iv.toString('base64');  // Append IV in base64 format.
}

export function decrypt(privkey, pubkey, ciphertext) {
  try {
    const [emsg, ivBase64] = ciphertext.split('?iv=');
    if (!emsg || !ivBase64) {
      throw new Error("Ciphertext or IV is missing");
    }

    const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
    const encryptionKey = Buffer.from(sharedSecret.slice(1, 33)); // Use only the X coordinate.

    const iv = Buffer.from(ivBase64, 'base64');

    const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);

    let decryptedMessage = decipher.update(emsg, 'base64', 'utf8');
    decryptedMessage += decipher.final('utf8');
    return decryptedMessage;
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;  // Handle error appropriately
  }
}

// Convert hexadecimal string to human-readable string
export function hexToString(hexStr) {
  var str = '';
  for (var i = 0; i < hexStr.length; i += 2)
    str += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
  return str;
}