import WebSocket from 'ws';
import crypto from 'crypto'; // For UUID generation
import fetch from 'node-fetch';
import { processDirectMessage, processTextNote } from './processing.js';
import { publicKey } from './configs.js';

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

function handleEvent(data) {
  let event;
  if (typeof data === 'string') {
    if (isLikelyJson(data)) {
      try {
        event = JSON.parse(data);
        console.log(`${new Date().toISOString()} - Parsed event JSON:`, event);
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
    console.log(`${new Date().toISOString()} - Event passed initial checks, processing event:`, event);
    processEvent(event);
  } else {
    console.error(`${new Date().toISOString()} - Malformed or incomplete event data received:`, event);
  }
}

let keyWords = [""];

function processEvent(event) {
  //console.log(`${new Date().toISOString()} - Processing event:`, event);

  // Check if tags exist and ensure they are an array
  if (Array.isArray(event.tags)) {
    // Find 'p' tag that matches the bot's public key
    const pTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1] === publicKey);
    const tTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 't' && keyWords.includes(tag[1]));
    console.log("Checking tags", event.tags);
    console.log("Public key used for checking", publicKey);

    if (pTag || tTag) {
      console.log(`${new Date().toISOString()} - Event with our pubkey found:`, event);
      switch (event.kind) {
        case 1:
          processTextNote(event);
          break;
        case 4:
          processDirectMessage(event);
          break;
        default:
          console.log(`${new Date().toISOString()} - Unsupported event kind:`, event.kind);
      }
    } else {
      //console.log(`${new Date().toISOString()} - Event does not include our pubkey in tags, skipping.`);
    }
  } else {
    console.error(`${new Date().toISOString()} - Malformed tags in event:`, event);
  }
}



