import { encrypt, decrypt } from './encryption.js';
import { privateKey, publicKey } from './configs.js';

const testMessage = "This is a test message.";
console.log("Original:", testMessage);

const encrypted = encrypt(privateKey, publicKey, testMessage);
console.log("Encrypted:", encrypted);

const decrypted = decrypt(privateKey, publicKey, encrypted);
console.log("Decrypted:", decrypted);
