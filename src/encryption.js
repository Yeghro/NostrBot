import { getSharedSecret } from 'noble-secp256k1';
import crypto, { createCipheriv, createDecipheriv } from 'crypto';

export function encrypt(privkey, pubkey, text) {
  const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
  console.log("Shared secret (encrypt):", sharedSecret.toString('hex'));
  const encryptionKey = Buffer.from(sharedSecret.slice(1, 33)); // Use only the X coordinate, directly.
  console.log("Encryption key (encrypt):", encryptionKey.toString('hex'));
  const iv = crypto.randomBytes(16); // Generate a random IV.
  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
  let encryptedMessage = cipher.update(text, 'utf8', 'base64');
  encryptedMessage += cipher.final('base64');
  console.log("Plaintext message:", text);
  console.log("Ciphertext:", encryptedMessage);
  console.log("IV:", iv.toString('base64'));
  return encryptedMessage + '?iv=' + iv.toString('base64'); // Append IV in base64 format.
}
function base64ToHex(base64) {
  const raw = Buffer.from(base64, 'base64');
  let hex = '';
  for (let i = 0; i < raw.length; i++) {
      const currentHex = raw[i].toString(16);
      hex += currentHex.length === 1 ? '0' + currentHex : currentHex;
  }
  return hex;
}

// Helper function to convert hex to bytes
function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return Buffer.from(bytes);
}

// Updated decrypt function
export function decrypt(privkey, pubkey, ciphertext) {
  try {
    const [emsg, ivBase64] = ciphertext.split('?iv=');
    if (!emsg || !ivBase64) {
      throw new Error("Ciphertext or IV is missing");
    }
    
    const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
    console.log("Shared secret (decrypt):", sharedSecret.toString('hex'));
    const encryptionKey = Buffer.from(sharedSecret.slice(1, 33)); // Use only the X coordinate directly as bytes
    console.log("Encryption key (decrypt):", encryptionKey.toString('hex'));
    const iv = Buffer.from(ivBase64, 'base64');
    
    const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
    let decryptedMessage = decipher.update(emsg, 'base64', 'binary');
    decryptedMessage += decipher.final('binary');
    return decryptedMessage;
  } catch (error) {
    console.error("Error in decryption:", error.message);
    return null;
  }
}
