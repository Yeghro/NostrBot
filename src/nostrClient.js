import WebSocket from 'ws';
import dotenv from 'dotenv';
import crypto, { createDecipheriv, createHash } from 'crypto'; // For UUID generation
import { decrypt, hexToString, } from './encryption.js'; // Make sure these functions are imported
import { getSharedSecret } from 'noble-secp256k1';

dotenv.config();
const publicKey = process.env.PUBLIC_KEY;
const privateKey = process.env.PRIVATE_KEY;
console.log('Bot starting with public key:', publicKey);

let ws; // WebSocket connection

function sendSubscription() {
  const subscriptionId = crypto.randomUUID();
  const subscription = ["REQ", subscriptionId, { kinds: [4] }]; // Subscribe to all authors for kind 1
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

function isJsonString(str) {
  try {
      JSON.parse(str);
  } catch (e) {
      return false;
  }
  return true;
}

function isLikelyJson(data) {
  let trimmedData = data.trim();
  return trimmedData.startsWith('{') && trimmedData.endsWith('}') ||
         trimmedData.startsWith('[') && trimmedData.endsWith(']');
}


function handleEvent(data) {
  //console.log(`${new Date().toISOString()} - Received raw data:`, data);  // Log raw data for debugging

  if (typeof data === 'string' && isLikelyJson(data)) {
      try {
          const parsedData = JSON.parse(data);
          if (!Array.isArray(parsedData) || parsedData.length < 2) {
              console.error(`${new Date().toISOString()} - Received malformed JSON data:`, parsedData);
              return;
          }

          const messageType = parsedData[0];
          switch (messageType) {
              case "EVENT":
                  const event = parsedData[2];
                  processEvent(event);
                  break;
              default:
                  //console.log(`${new Date().toISOString()} - Handled non-event JSON data:`, parsedData);
          }
      } catch (error) {
          console.error(`${new Date().toISOString()} - Error parsing JSON or processing event:`, error);
      }
  } else {
      //console.log(`${new Date().toISOString()} - Non-JSON data or identifier received, skipping:`, data);
  }
}





function processEvent(event) {
  console.log(`${new Date().toISOString()} - Processing event:`, event);
  // Check if tags exist and are an array
  if (Array.isArray(event.tags)) {
    const pTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1] === publicKey);
    if (pTag) {
      console.log(`${new Date().toISOString()} - Event with our pubkey:`, event);
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
  console.log(`${new Date().toISOString()} - Received text note:`, event.content);

}

function processTaggedTextNote(event) {
  if (event.content) {
    try {
      let decryptedMessage = decrypt(privateKey, event.pubkey, event.content);
      let readableContent = decryptedMessage;
      console.log(`${new Date().toISOString()} - Decrypted text note:`, readableContent);
      // Process the decrypted text note content
      // ...
    } catch (error) {
      console.error(`${new Date().toISOString()} - Error decrypting text note:`, error);
    }
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
        const encryptionKey = createHash('sha256').update(sharedSecret).digest().slice(0, 32);
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
