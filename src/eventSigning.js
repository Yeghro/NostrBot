import { schnorr, utils } from 'noble-secp256k1';
import { bytesToHex, hexToBytes } from './utils.js';
import { finalizeEvent } from 'nostr-tools/pure';

export async function getSignedEvent(event, privateKey) {
  try {
    if (!event || !privateKey) {
      throw new Error('Invalid event data or private key.');
    }

    const signedEvent = finalizeEvent(event, privateKey);
    return signedEvent;
  } catch (error) {
    console.error('Error signing event:', error);
    return null;
  }
}
