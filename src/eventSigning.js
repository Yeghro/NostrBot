import { schnorr, utils } from 'noble-secp256k1';
import { bytesToHex } from './utils.js';
import { publicKey, privateKey } from './configs.js';

export async function getSignedEvent(event, privateKey) {
  try {
    if (!event || !privateKey) throw new Error('Invalid event data or private key.');

    const eventData = JSON.stringify([
      0,                   // Reserved for future use
      event['pubkey'],     // The sender's public key
      event['created_at'], // Unix timestamp
      event['kind'],       // Message "kind" or type
      event['tags'],       // Tags identify replies/recipients
      event['content']     // Your note contents
    ]);

    const msgHash = utils.sha256(new TextEncoder().encode(eventData));
    event.id = bytesToHex(msgHash);
    event.sig = await schnorr.sign(msgHash, privateKey);
    return event;
  } catch (error) {
    console.error('Error signing event:', error);
    return null;
  }
}
