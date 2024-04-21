import { getSharedSecret } from 'noble-secp256k1';
import crypto, { createCipheriv, createDecipheriv } from 'crypto';
import { hexToBytes } from './utils.js';

export function encrypt(privkey, pubkey, message) {
  try {
    // Generate shared secret using sender's private key and recipient's public key
    const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
    console.log("Shared secret (encrypt):", sharedSecret.toString('hex'));
    
    // Use only the X coordinate of the shared secret as the encryption key
    const encryptionKey = Buffer.from(sharedSecret.slice(1, 33));
    console.log("Encryption key (encrypt):", encryptionKey.toString('hex'));
    
    // Generate a random IV
    const iv = crypto.randomBytes(16);  // Ensure the IV is 16 bytes for AES-256-CBC
    console.log("IV (encrypt, base64):", iv.toString('base64'));

    // Create cipher instance
    const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encrypted = cipher.update(message, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Format the ciphertext with IV as required by NIP-04
    const formattedCiphertext = `${encrypted}?iv=${iv.toString('base64')}`;
    console.log("Formatted Ciphertext:", formattedCiphertext);
    
    return formattedCiphertext;
  } catch (error) {
    console.error("Error in encryption:", error.message);
    return null;
  }
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


// Updated decrypt function
export function decrypt(privkey, pubkey, ciphertext) {
  try {
    const [emsg, ivBase64] = ciphertext.split('?iv=');
    if (!emsg || !ivBase64) {
      throw new Error("Ciphertext or IV is missing");
    }
    
    const sharedSecret = getSharedSecret(privkey, '02' + pubkey);
    console.log("Shared secret (decrypt):", sharedSecret.toString('hex'));
    const encryptionKey = Buffer.from(sharedSecret.slice(0, 32)); // Use first 32 bytes directly if sharedSecret is a buffer
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
