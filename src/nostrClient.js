import WebSocket from 'ws';
import crypto, { createDecipheriv } from 'crypto'; // For UUID generation
import { decrypt } from './encryption.js'; // Make sure these functions are imported
import { getSharedSecret } from 'noble-secp256k1';
import { publicKey, privateKey } from './configs.js';
import fetch from 'node-fetch';
import { getSignedEvent } from './eventSigning.js';

let ws; // WebSocket connection

let startTime;  // Store the start time at a scope accessible by the ws.on('message') handler

function sendSubscription() {
    startTime = Math.floor(Date.now() / 1000);  // Get current Unix timestamp
    const subscriptionId = crypto.randomUUID();
    const subscription = ["REQ", subscriptionId, { kinds: [4] }];  // Subscribe to kind 4 events
    ws.send(JSON.stringify(subscription));
    console.log(`${new Date().toISOString()} - Subscription message sent with timestamp:`, startTime);
}


function connectWebSocket() {
    ws = new WebSocket('wss://nostrpub.yeghro.site');

    ws.on('open', () => {
        console.log(`${new Date().toISOString()} - Connected to the relay`);
        sendSubscription();
    });

    ws.on('message', (data) => {
      const messageString = data.toString();
      try {
          const events = JSON.parse(messageString);
          events.forEach(event => {
              if (event.created_at && event.created_at >= startTime) {  // Check if the event's timestamp is after the bot started
                  handleEvent(event);
              } else {
                  console.log(`Ignoring old event from before start time: ${event.created_at}`);
              }
          });
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
  //console.log(`${new Date().toISOString()} - Processing event:`, event);

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
      //console.log(`${new Date().toISOString()} - Event does not include our pubkey in tags, skipping.`);
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
              sharedSecret = Buffer.from(sharedSecret, 'hex');  // Convert from hex string if necessary
          }

          console.log("Shared secret (Buffer):", sharedSecret.toString('hex'));
          const encryptionKey = Buffer.from(sharedSecret.slice(1, 33)); // Use only the X coordinate
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
            pubkey: publicKey, // Your bot's public key
            created_at: Math.floor(Date.now() / 1000),
            kind: 4,
            tags: [['p', event.pubkey]], // Set the recipient's public key here
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
    console.log("Full Ollama API Response:", JSON.stringify(responseData, null, 2));

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
