import { schnorr, utils } from 'noble-secp256k1';
import { bytesToHex, hexToBytes } from './utils.js';
import { getSignedEvent, encrypt, decrypt } from 'nostr-tools';

export async function getSignedEvent(event, privateKey) {
  try {
    if (!event || !privateKey) {
      throw new Error('Invalid event data or private key.');
    }
    
    const { pubkey, created_at, kind, tags, content } = event;
    if (!pubkey || !created_at || !kind || !tags || !content) {
      throw new Error('Event data fields are incomplete or malformed.');
    }

    // Serialize event data as defined in NIP-04
    const eventData = JSON.stringify([
      0, pubkey, created_at, kind, tags, content
    ]);

    const msgHash = utils.sha256(new TextEncoder().encode(eventData));
    const msgHashHex = Array.from(msgHash).map(byte => byte.toString(16).padStart(2, '0')).join('');
    event.id = msgHashHex;
    event.sig = await schnorr.sign(msgHashHex, privateKey);

    console.log('Message Hash (hex):', event.id);
    console.log('Signature:', event.sig);

    return event;
  } catch (error) {
    console.error('Error signing event:', error);
    return null;
  }
}
