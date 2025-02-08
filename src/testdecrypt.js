import {publicKey, privateKey} from "./configs.js";
import { encrypt, decrypt } from "./encryption.js";

const hex = hexConverter(new Uint8Array([1, 2, 3]));

async function testEncryptionDecryption() {
    const secretKey = privateKey;  // Replace with actual private key
    const pubkey = publicKey;    // Replace with actual public key
    const message = "Hello, this is a test message!";
  
    try {
      const encryptedMessage = await encrypt(secretKey, pubkey, message);
      console.log("Encrypted Message:", encryptedMessage);
  
      // Assume decrypt function is similar to the encrypt function's counterpart
      const decryptedMessage = await decrypt(secretKey, pubkey, encryptedMessage);
      console.log("Decrypted Message:", decryptedMessage);
  
      if (message === decryptedMessage) {
        console.log("Test passed: The decrypted message matches the original");
      } else {
        console.log("Test failed: The decrypted message does not match the original");
      }
    } catch (error) {
      console.error("Test failed with error:", error);
    }
  }
  
  testEncryptionDecryption();
  