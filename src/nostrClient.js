import WebSocket from 'ws';
import crypto, { createDecipheriv } from 'crypto'; // For UUID generation
import { decrypt } from './encryption.js'; // Make sure these functions are imported
import { getSharedSecret } from 'noble-secp256k1';
import { publicKey, privateKey } from './configs.js';


let ws; // WebSocket connection

function sendSubscription() {
  const subscriptionId = crypto.randomUUID();
  const subscription = ["REQ", subscriptionId, { kinds: [4,1] }]; // Subscribe to all authors for kind 1
  ws.send(JSON.stringify(subscription));
  console.log(`${new Date().toISOString()} - Subscription message sent:`, JSON.stringify(subscription));
}


function connectWebSocket() {
    ws = new WebSocket('wss://nostrpub.yeghro.site');

    ws.on('open', () => {
        console.log(`${new Date().toISOString()} - Connected to the relay`);
        sendSubscription();
    });

    ws.on('message', (data) => {
        const messageString = data.toString();
        //console.log(`${new Date().toISOString()} - Message received:`, messageString);
        try {
            const events = JSON.parse(messageString);
            events.forEach(event => handleEvent(event));
        } catch (error) {
            console.error(`${new Date().toISOString()} - Error parsing JSON or processing event:`, error);
        }
    });

    ws.on('error', (error) => {
        console.error(`${new Date().toISOString()} - WebSocket error:`, error);
        setTimeout(connectWebSocket, 5000);
    });

    ws.on('close', () => {
        console.log(`${new Date().toISOString()} - Disconnected from the relay`);
        setTimeout(connectWebSocket, 5000);
    });
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
        // Parse the JSON string
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
    // Use the data directly if it's already an object
    event = data;
  } else {
    console.log(`${new Date().toISOString()} - Invalid data type received, skipping:`, data);
    return;
  }

  // Check if the event is correctly structured and has the necessary properties
  if (event && event.kind && Array.isArray(event.tags)) {
    console.log(`${new Date().toISOString()} - Processing event:`, event);
    processEvent(event);
  } else {
    console.error(`${new Date().toISOString()} - Malformed or incomplete event data received:`, event);
  }
}

function processEvent(event) {
  console.log(`${new Date().toISOString()} - Processing event:`, event);

  // Check if tags exist and ensure they are an array
  if (Array.isArray(event.tags)) {
    // Find 'p' tag that matches the bot's public key
    const pTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1] === publicKey);
    console.log("Checking tags", event.tags);
    console.log("Public key used for checking", publicKey);

    if (pTag) {
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
      console.log(`${new Date().toISOString()} - Event does not include our pubkey in tags, skipping.`);
    }
  } else {
    console.error(`${new Date().toISOString()} - Malformed tags in event:`, event);
  }
}

function processTextNote(event) {
  if (event.content) {
    console.log(`${new Date().toISOString()} - Received text note:`, event.content);
    // Here you can implement additional processing of the text note content
  } else {
    console.log(`${new Date().toISOString()} - No content in text note.`);
  }
}


function processDirectMessage(event) {
  console.log(`${new Date().toISOString()} - Attempting to process direct message:`, event);
  if (event.kind !== 4) {
    console.error('Not a direct message:', event);
    return;
  }
  if (event.content && event.content.includes('?iv=')) {
    const [encryptedMessage, ivBase64] = event.content.split('?iv=');
    if (ivBase64) {
      try {
        const iv = Buffer.from(ivBase64, 'base64');
        const sharedSecret = getSharedSecret(privateKey, '02' + event.pubkey);
        let encryptionKey = Buffer.from(sharedSecret.slice(1, 33)); // Use only the X coordinate.
        const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
        let decryptedMessage = decipher.update(encryptedMessage, 'base64', 'utf8');
        decryptedMessage += decipher.final('utf8');
        console.log(`${new Date().toISOString()} - Decrypted direct message:`, decryptedMessage);
      } catch (error) {
        console.error(`${new Date().toISOString()} - Error decrypting direct message:`, error);
      }
    } else {
      console.error('IV missing in the message content:', event.content);
    }
  } else {
    console.log(`${new Date().toISOString()} - No content or missing IV in direct message.`);
  }
}



function processReadableContent(content) {
  console.log(`${new Date().toISOString()} - Processing content:`, content);
  // Here you can implement logic based on the content, such as responding to commands, storing data, etc.
}
function processTaggedEvent(event, pubkey) {
  console.log(`${new Date().toISOString()} - Processing event tagged with our pubkey:`, event.id);
  // Here you can add logic based on events specifically tagged with the bot's public key
}

function handleEncryptedEvent(event) {
  console.log(`Handling encrypted event with ID: ${event.id}`);

  if (event.content) {
    let decryptedMessage = decrypt(privateKey, event.pubkey, event.content);
    displayReadableContent(decryptedMessage);  // Using the newly defined function
  } else {
      console.log('No content to decrypt.');
  }
}



connectWebSocket();
