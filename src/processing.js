
import { sendMessageToOllama } from './ollamaReq.js';
import { publicKey, privateKey } from './configs.js';
import { getSignedEvent } from './eventSigning.js';
import { ws } from './nostrClient.js';
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
  export async function processDirectMessage(event, imageUrls, content, pubkey) {
    console.log("Processing event:", event);
    if (event.kind !== 4) {
      console.error('Not a direct message:', event);
      return;
    }
  
    let replyContent;
  
    if (content.includes("/GetImages")) {
      // If the content includes the /GetImages trigger phrase, return only the images
      if (imageUrls.length > 0) {
        replyContent = `Here are the images associated with pubkey ${pubkey}:\n${imageUrls.join('\n')}`;
      } else {
        replyContent = `No images found for pubkey ${pubkey}.`;
      }
    } else {
      // If the content does not include the /GetImages trigger phrase, send the message to Ollama
      const messages = [{ role: 'user', content: content }];
      const ollamaResponse = await sendMessageToOllama(messages);
      console.log("Ollama response received:", ollamaResponse);
  
      replyContent = typeof ollamaResponse === 'object' && ollamaResponse.hasOwnProperty('replyContent')
        ? ollamaResponse.replyContent
        : "No response generated.";
    }
  
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
  }
  