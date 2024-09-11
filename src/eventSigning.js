import { finalizeEvent } from 'nostr-tools/pure';


export async function getSignedEvent(event, privateKey) {
  try {
    // Check for valid event data
    if (!event || typeof event !== 'object') {
      throw new Error('Invalid event data. Expected a non-null object.');
    }

    // Check for valid private key
    if (!privateKey || typeof privateKey !== 'string') {
      throw new Error('Invalid private key. Expected a non-empty string.');
    }

    const signedEvent = finalizeEvent(event, privateKey);
    return signedEvent;
  } catch (error) {
    console.error('Error signing event:', error.message);
    return null;
  }
}
