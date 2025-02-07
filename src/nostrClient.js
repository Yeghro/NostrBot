import { processDirectMessage, processTextNote, processNonCommand } from './processing.js';
import { publicKey, privateKey } from './configs.js';
import { fetchImages } from './imageFetch.js';
import { fetchNotes } from './fetchNotes.js';
import { createPool, DEFAULT_RELAYS, normalizePublicKey } from './nostrConnection.js';
import { decrypt } from 'nostr-tools/nip04';

export let subscriptionHandle;
let startTime;
let reconnectionAttempts = 0;
const { pool, cleanup } = createPool();

console.log("Using the following keys:", publicKey, privateKey);

export function connectWebSocket() {
    // Adjust start time to 5 seconds before the current time
    startTime = Math.floor(Date.now() / 1000) - 5;
    
    try {
        subscriptionHandle = pool.subscribeMany(
            DEFAULT_RELAYS,
            [{ kinds: [4, 1] }],
            {
                onevent(event) {
                    if (event.created_at && event.created_at >= startTime) {
                        handleEvent(event);
                    }
                },
                oneose() {
                    console.log(`${new Date().toISOString()} - EOSE received from relays`);
                    reconnectionAttempts = 0; // Reset attempts on successful connection
                },
                onerror(err) {
                    console.error(`${new Date().toISOString()} - Subscription error:`, err);
                    attemptReconnect();
                }
            }
        );
        
        console.log(`${new Date().toISOString()} - Connected to relays: ${DEFAULT_RELAYS}`);
    } catch (error) {
        console.error(`${new Date().toISOString()} - Error connecting to relays:`, error);
        attemptReconnect();
    }
}

function attemptReconnect() {
    reconnectionAttempts++;
    const reconnectDelay = Math.min(30000, (2 ** reconnectionAttempts) * 1000);
    console.log(`${new Date().toISOString()} - Attempting to reconnect in ${reconnectDelay / 1000} seconds...`);
    
    if (subscriptionHandle) {
        subscriptionHandle.close();
    }
    
    setTimeout(connectWebSocket, reconnectDelay);
}

function isLikelyJson(data) {
  let trimmedData = data.trim();
  return (trimmedData.startsWith('{') && trimmedData.endsWith('}')) ||
         (trimmedData.startsWith('[') && trimmedData.endsWith(']'));
}

let keyWords = ["askyeghro"];

function handleEvent(data) {
  let event;
  if (typeof data === 'string') {
    if (isLikelyJson(data)) {
      try {
        event = JSON.parse(data);
      } catch (error) {
        console.error(`${new Date().toISOString()} - Error parsing JSON:`, error);
        return;
      }
    } else {
      console.log(`${new Date().toISOString()} - Received non-JSON string, skipping:`, data);
      return;
    }
  } else if (typeof data === 'object' && data !== null) {
    event = data;
  } else {
    console.log(`${new Date().toISOString()} - Invalid data type received, skipping:`, data);
    return;
  }

  if (event && event.kind && Array.isArray(event.tags)) {
    // Moved tag checking logic here
    const pTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1] === publicKey);
    const tTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 't' && keyWords.includes(tag[1]));

    if (pTag || tTag) {
      console.log(`${new Date().toISOString()} - Event with keyword or pubkey found:`, event);
      processEvent(event); // Continue processing the event if the tags are correct
    } else {
      console.error(`${new Date().toISOString()} - Event does not contain valid pTag or tTag, skipping:`, event);
    }
  } else {
    console.error(`${new Date().toISOString()} - Malformed or incomplete event data received:`, event);
  }
}

function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';
  // Remove any control characters and limit length
  return input.replace(/[\x00-\x1F\x7F-\x9F]/g, '').slice(0, MAX_CONTENT_LENGTH);
}

const MAX_CONTENT_LENGTH = 64000; // NIP-01 suggested limit


async function processEvent(event) {
  let content = event.content;
  let pubkey = event.pubkey;

  // Sanitize content before processing
  content = sanitizeInput(content);
  
  if (!content) {
    console.log('Empty or invalid content received');
    return;
  }

  // Decrypt if needed (kind 4)
  if (event.kind === 4) {
    try {
      console.log('Attempting to decrypt with:');
      console.log('Private key length:', privateKey?.length);
      console.log('Sender pubkey length:', pubkey?.length);
      console.log('Content length:', content?.length);
      
      if (!privateKey) {
        throw new Error('Private key is missing');
      }
      
      content = await decrypt(privateKey, pubkey, content);
      content = sanitizeInput(content); // Sanitize after decryption too
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      console.error('Debug info:', {
        hasPrivateKey: !!privateKey,
        senderPubkeyPresent: !!pubkey,
        contentPresent: !!content
      });
      return;
    }
  }

  // Check for specific commands and fetch data accordingly.
  if (content.match(/\/(GetNotes|getnotes)/i)) {
    let matches = content.match(/\/(GetNotes|getnotes)\s+"([^"]+)"(?:\s+"([^"]+)")?(?:\s+"([^"]+)")?/i);
    if (matches) {
      const requestedPubkey = matches[2].trim();
      const startDate = matches[3] ? matches[3].trim() : null;
      const endDate = matches[4] ? matches[4].trim() : null;
      const requestedNotes = await fetchNotes(requestedPubkey, startDate, endDate);
      if (event.kind === 1) {
        processTextNote(event, { content, pubkey, requestedPubkey, requestedNotes });
      } else if (event.kind === 4) {
        processDirectMessage(event, { content, pubkey, requestedPubkey, requestedNotes });
      }
    } else {
      console.log('Invalid command format. Usage: /GetNotes or /getnotes "pubkey" ["startDate"] ["endDate"]');
    }
  } else if (content.match(/\/(GetImages|getimages)/i)) {
    let matches = content.match(/\/(GetImages|getimages)\s+"([^"]+)"(?:\s+"([^"]+)")?(?:\s+"([^"]+)")?/i);
    if (matches) {
      const requestedPubkey = matches[2].trim();
      const startDate = matches[3] ? matches[3].trim() : null;
      const endDate = matches[4] ? matches[4].trim() : null;
      const imageUrls = await fetchImages(requestedPubkey, startDate, endDate);
      if (event.kind === 1) {
        processTextNote(event, { content, pubkey, requestedPubkey, imageUrls });
      } else if (event.kind === 4) {
        processDirectMessage(event, { content, pubkey, requestedPubkey, imageUrls });
      }
    } else {
      console.log('Invalid command format. Usage: /GetImages or /getimages "pubkey" ["startDate"] ["endDate"]');
    }
  } else {
    // Handle non-command events for both text notes and direct messages.
    if (event.kind === 1 || event.kind === 4) {
      processNonCommand(event, { content, pubkey });
    } else {
      console.log(`Unsupported event kind: ${event.kind}`);
    }
  }
}
