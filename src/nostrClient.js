import WebSocket from 'ws';
import crypto, { createDecipheriv } from 'crypto'; // For UUID generation
import { decrypt } from './encryption.js'; // Make sure these functions are imported
import { getSharedSecret } from 'noble-secp256k1';
import { publicKey, privateKey } from './configs.js';
import fetch from 'node-fetch';
import { getSignedEvent } from './eventSigning.js';

let startTime;  // Store the start time at a scope accessible by the ws.on('message') handler

let wsConnections = []; // Array to store multiple WebSocket connections

function sendSubscription(ws) {
  startTime = Math.floor(Date.now() / 1000);  // Get current Unix timestamp
  const subscriptionId = crypto.randomUUID();
    const subscription = ["REQ", subscriptionId, { kinds: [4,1] }];  // Subscribe to kind 4 and 1 events
    ws.send(JSON.stringify(subscription));
    console.log(`${new Date().toISOString()} - Subscription message sent to ${ws.url} with timestamp:`, startTime);
}

function connectWebSocket(relayUrl) {
    const ws = new WebSocket(relayUrl);

    ws.on('open', () => {
        console.log(`${new Date().toISOString()} - Connected to the relay: ${relayUrl}`);
        sendSubscription(ws);
    });

    ws.on('message', (data) => {
      const messageString = data.toString();
      try {
        const events = JSON.parse(messageString);
        events.forEach(event => {
          if (event.created_at && event.created_at >= startTime) {
            processTextNote(event, ws); // Now passing ws
          } else {
            console.log(`Ignoring old event from before start time: ${event.created_at}`);
          }
        });
      } catch (error) {
        console.error(`${new Date().toISOString()} - Error parsing JSON or processing event:`, error);
      }
    });
    

    ws.on('error', (error) => {
        console.error(`${new Date().toISOString()} - WebSocket error for ${relayUrl}:`, error);
        setTimeout(() => connectWebSocket(relayUrl), 5000);
    });

    ws.on('close', () => {
        console.log(`${new Date().toISOString()} - Disconnected from the relay: ${relayUrl}`);
        setTimeout(() => connectWebSocket(relayUrl), 5000);
    });

    wsConnections.push(ws); // Add this WebSocket connection to the array
}

// Define your relay URLs
const relayUrls = [
    'wss://nostrpub.yeghro.site',
];

// Connect to all relays
relayUrls.forEach(url => connectWebSocket(url));


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
        // Parse the JSON string
        event = JSON.parse(data);
      } catch (error) {
        //console.error(`${new Date().toISOString()} - Error parsing JSON:`, error);
        return;
      }
    } else {
      //console.log(`${new Date().toISOString()} - Received non-JSON string, skipping:`, data);
      return;
    }
  } else if (typeof data === 'object' && data !== null) {
    // Use the data directly if it's already an object
    event = data;
  } else {
    //console.log(`${new Date().toISOString()} - Invalid data type received, skipping:`, data);
    return;
  }

  // Check if the event is correctly structured and has the necessary properties
  if (event && event.kind && Array.isArray(event.tags)) {
    //console.log(`${new Date().toISOString()} - Processing event:`, event);
    processEvent(event);
  } else {
    //console.error(`${new Date().toISOString()} - Malformed or incomplete event data received:`, event);
  }
}

function processEvent(event) {
  console.log(`${new Date().toISOString()} - Processing event:`, event);

  if (Array.isArray(event.tags)) {
    // Log all tags for debugging
    console.log("All tags in the event:", event.tags);

    const pTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1] === publicKey);
    const tTag = event.tags.some(tag => Array.isArray(tag) && tag[0] === 't' && triggerKeywords.some(keyword => tag[1].toLowerCase().includes(keyword.toLowerCase())));

    if (pTag) {
      console.log(`${new Date().toISOString()} - Public key tag found.`);
    } else {
      console.log(`${new Date().toISOString()} - No public key tag found.`);
    }

    if (tTag) {
      console.log(`${new Date().toISOString()} - Trigger keyword found.`);
    } else {
      console.log(`${new Date().toISOString()} - No trigger keyword found in event tags.`);
    }

    if (pTag || tTag) {
      console.log(`${new Date().toISOString()} - Event with our pubkey or keyword found:`, event);
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
      console.log(`${new Date().toISOString()} - Event does not include our pubkey in tags, skipping.`);
    }
  } else {
    console.error(`${new Date().toISOString()} - Malformed tags in event:`, event);
  }
}

const triggerKeywords = ["askYEGHRO"];


async function processTextNote(event, ws) { // ws parameter added here
  if (event.content) {
    console.log(`${new Date().toISOString()} - Received text note:`, event.content);

    // Check if any tag value contains a trigger keyword or the bot's public key
    const containsTriggerKeyword = event.tags.some(tag => Array.isArray(tag) && tag[0] === 't' && triggerKeywords.some(keyword => tag.slice(1).join('').toLowerCase().includes(keyword.toLowerCase())));
    const isTaggedWithPublicKey = event.tags.some(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1] === publicKey);

    if (containsTriggerKeyword || isTaggedWithPublicKey) {
      // Prepare the message for Ollama
      const messages = [{ role: "user", content: event.content }];
      const ollamaResponse = await sendMessageToOllama(messages);
      console.log("Ollama response received:", ollamaResponse);

      // Verify response structure and extract the content appropriately
      const replyContent = typeof ollamaResponse === 'string' ? ollamaResponse : "No response generated.";
      console.log("Formatted reply content:", replyContent);

      const replyEvent = {
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [['e', event.id], ['p', event.pubkey]],
        content: replyContent
      };

      const signedReply = await getSignedEvent(replyEvent, privateKey);
      if (!signedReply) {
        console.error('Failed to sign the reply event.');
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(["EVENT", signedReply]));
          console.log('Reply sent:', signedReply);
      } else {
          console.error(`${new Date().toISOString()} - WebSocket is not open.`);
      }
    } else {
      console.log(`${new Date().toISOString()} - No trigger keyword or public key tag found in event tags.`);
    }
  } else {
    console.log(`${new Date().toISOString()} - No content in text note.`);
  }
}


async function processDirectMessage(event) {
  console.log("Processing event:", event);
  if (event.kind !== 4) {
    console.error('Not a direct message:', event);
    return;
  }

  console.log("Received content:", event.content);
  const [encryptedMessage, ivBase64] = event.content.split('?iv=');
  if (encryptedMessage && ivBase64) {
    console.log("Encrypted message:", encryptedMessage);
    console.log("IV (base64):", ivBase64);

    const iv = Buffer.from(ivBase64, 'base64');
    if (iv.length !== 16) {
      console.error("Invalid IV length: " + iv.length + " bytes. Must be exactly 16 bytes.");
      return;
    }

    try {
      let sharedSecret = getSharedSecret(privateKey, '02' + event.pubkey);
      if (typeof sharedSecret === 'string') {
        sharedSecret = Buffer.from(sharedSecret, 'hex');
      }

      console.log("Shared secret (Buffer):", sharedSecret.toString('hex'));
      const encryptionKey = Buffer.from(sharedSecret.slice(1, 33));
      console.log("Encryption key (Buffer):", encryptionKey.toString('hex'));
      console.log("Extracted pubkey:", event.pubkey);

      const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
      let decryptedMessage = decipher.update(encryptedMessage, 'base64', 'binary');
      decryptedMessage += decipher.final('binary');

      console.log("Decrypted message (Buffer):", decryptedMessage);
      const decryptedText = decryptedMessage.toString('utf8');
      console.log("Decrypted message (text):", decryptedText);

      // Prepare the message for Ollama
      const messages = [{ role: "user", content: decryptedText }];
      const ollamaResponse = await sendMessageToOllama(messages);
      console.log("Ollama response received:", ollamaResponse);

      // Verify response structure and extract the content appropriately
      const replyContent = typeof ollamaResponse === 'string' ? ollamaResponse : "No response generated.";
      console.log("Formatted reply content:", replyContent);

      const replyEvent = {
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', event.pubkey]],
        content: replyContent
      };
    
      const signedReply = await getSignedEvent(replyEvent, privateKey);
      if (!signedReply) {
        console.error('Failed to sign the reply event.');
        return;
      }
    
      ws.send(JSON.stringify(["EVENT", signedReply]));
      console.log('Reply sent:', signedReply);
        } catch (error) {
      console.error("Error decrypting message or communicating with Ollama:", error);
    }
  } else {
    console.error('Missing encrypted message or IV in the expected format.');
    console.error('Expected format: "<encrypted_text>?iv=<initialization_vector>"');
    console.error('Received content:', event.content);
  }
}
async function sendMessageToOllama(messages) {
  const body = {
    model: "sofs",
    prompt: messages.map(msg => msg.content).join(" "),
    stream: false
  };

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    //console.log("Full Ollama API Response:", JSON.stringify(responseData, null, 2));

    // Check if the response has the expected structure
    if (responseData.hasOwnProperty("response")) {
      const replyContent = responseData.response;
      console.log("Formatted reply content:", replyContent);
      return replyContent;
    } else {
      console.error("Unexpected response structure from Ollama API:", responseData);
      return "No response generated.";
    }
  } catch (error) {
    console.error("Failed to send message to Ollama API:", error);
    throw error;
  }
}




