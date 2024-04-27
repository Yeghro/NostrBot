
import { sendMessageToOllama } from './ollamaReq.js';
import { publicKey, privateKey } from './configs.js';
import { getSignedEvent } from './eventSigning.js';
import { ws } from './nostrClient.js';
import { getSharedSecret } from 'noble-secp256k1';
import { createDecipheriv } from 'crypto'; 
import { encrypt } from 'nostr-tools/nip04';

const chatContexts = {};

export async function processTextNote(event) {
    if (event.content) {
      console.log(`${new Date().toISOString()} - Received text note:`, event.content);

      let currentChatContext = chatContexts[event.id] || "";
  
      // Prepare the message for Ollama
      const messages = [{ role: "user", content: event.content }];
  
      try {
        // Call the sendMessageToOllama function and await the response
        const ollamaResponse = await sendMessageToOllama(messages, currentChatContext);
        console.log("Ollama response received:", ollamaResponse);
  
        // Update the context with the new value from the response
        chatContexts[event.id] = ollamaResponse.newContext;
        console.log(chatContexts);

        // Verify response structure and extract the content appropriately
        const replyContent = typeof ollamaResponse === 'object' && ollamaResponse.hasOwnProperty('replyContent')
        ? ollamaResponse.replyContent
        : "No response generated.";
        
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
  
        ws.send(JSON.stringify(["EVENT", signedReply]));
        console.log('Reply sent:', signedReply);
      } catch (error) {
        console.error('Error occurred while processing text note:', error);
      }
    } else {
      console.log(`${new Date().toISOString()} - No content in text note.`);
    }
  }
export async function processDirectMessage(event) {
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
            if (encryptionKey.length !== 32) {
                console.error("Invalid encryption key length: " + encryptionKey.length + " bytes. Must be exactly 32 bytes.");
                return;
            }
            console.log("Encryption key (Buffer):", encryptionKey.toString('hex'));
  
            const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
            let decryptedMessage = decipher.update(encryptedMessage, 'base64', 'binary');
            decryptedMessage += decipher.final('binary');
  
            console.log("Decrypted message (Buffer):", decryptedMessage);
            const decryptedText = decryptedMessage.toString('utf8');
            console.log("Decrypted message (text):", decryptedText);
  
            // Prepare the message for Ollama
            const messages = [{ role: 'user', content: decryptedText }];
            const ollamaResponse = await sendMessageToOllama(messages);
            console.log("Ollama response received:", ollamaResponse);
  
            const replyContent = typeof ollamaResponse === 'object' && ollamaResponse.hasOwnProperty('replyContent')
            ? ollamaResponse.replyContent
            : "No response generated.";
            let pubkey = event.pubkey;
            // Encrypt the reply content before sending
            const encryptedReplyContent = await encrypt(privateKey, pubkey, replyContent);
      
      
            const replyEvent = {
                pubkey: publicKey,
                created_at: Math.floor(Date.now() / 1000),
                kind: 4,
                tags: [['p', event.pubkey]],
                content: encryptedReplyContent
            };
        
            const signedReply = await getSignedEvent(replyEvent, privateKey);
            if (!signedReply) {
                console.error('Failed to sign the reply event.');
                return;
            }
        
            ws.send(JSON.stringify(["EVENT", signedReply]));
            console.log('Reply sent:', signedReply);
        } catch (error) {
            console.error("Error decrypting message or during the process:", error);
        }
    } else {
        console.error('Missing encrypted message or IV in the expected format.');
        console.error('Expected format: "<encrypted_text>?iv=<initialization_vector>"');
        console.error('Received content:', event.content);
    }
  }
  