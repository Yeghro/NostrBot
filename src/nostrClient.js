import WebSocket from 'ws';
import crypto from 'crypto'; // For UUID generation
import { decrypt } from 'nostr-tools/nip04';
import { processDirectMessage, processTextNote, processNonCommand } from './processing.js';
import { publicKey, privateKey } from './configs.js';
import { fetchImages } from './imageFetch.js';
import { fetchNotes } from './fetchNotes.js';

export let ws; // WebSocket connection

let startTime;  // Store the start time at a scope accessible by the ws.on('message') handler

let reconnectionAttempts = 0;

export function connectWebSocket() {
    ws = new WebSocket('wss://nostrpub.yeghro.site');

    ws.on('open', () => {
        console.log(`${new Date().toISOString()} - Connected to the relay`);
        sendSubscription();
        reconnectionAttempts = 0; // Reset the reconnection attempts on a successful connection
    });

    ws.on('message', (data) => {
      const messageString = data.toString();
      try {
          const events = JSON.parse(messageString);
          events.forEach(event => {
              if (event.created_at && event.created_at >= startTime) {
                  handleEvent(event);
              } else {
                  //console.log(`Ignoring old event from before start time: ${event.created_at}`);
              }
          });
      } catch (error) {
          console.error(`${new Date().toISOString()} - Error parsing JSON or processing event:`, error);
      }
    });

    ws.on('error', (error) => {
        console.error(`${new Date().toISOString()} - WebSocket error:`, error);
        attemptReconnect();
    });

    ws.on('close', () => {
        console.log(`${new Date().toISOString()} - Disconnected from the relay`);
        attemptReconnect();
    });
}

function sendSubscription() {
  // Adjust start time to 5 seconds before the current time to catch any events that occur during connection setup
  startTime = Math.floor(Date.now() / 1000) - 5;
  const subscriptionId = crypto.randomUUID();
  const subscription = ["REQ", subscriptionId, { kinds: [4,1] }];  // Subscribe to kind 4 and 1 events
  ws.send(JSON.stringify(subscription));
  console.log(`${new Date().toISOString()} - Subscription message sent with adjusted start time:`, startTime);
}

function attemptReconnect() {
    reconnectionAttempts++;
    const reconnectDelay = Math.min(30000, (2 ** reconnectionAttempts) * 1000); // Delay grows exponentially but caps at 30 seconds
    console.log(`${new Date().toISOString()} - Attempting to reconnect in ${reconnectDelay / 1000} seconds...`);
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

async function processEvent(event) {
  let content = event.content;
  let pubkey = event.pubkey;

  // Assume decryption and command matching need to continue based on event.kind
  if (event.kind === 4) {
    content = await decrypt(privateKey, pubkey, content);
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
