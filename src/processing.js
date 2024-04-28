
import { sendMessageToOllama } from './ollamaReq.js';
import { publicKey, privateKey } from './configs.js';
import { getSignedEvent } from './eventSigning.js';
import { ws } from './nostrClient.js';
import { encrypt } from 'nostr-tools/nip04';

const chatContexts = {};

export async function processTextNote(event, requestedNotes, imageUrls) {
  if (event.content) {
    console.log(`${new Date().toISOString()} - Received text note:`, event.content);
  }
  
  let replyContent;

  if (event.content.includes("/GetNotes")) {
    if (requestedNotes && requestedNotes.length > 0) {
      replyContent = `Here are the notes associated with pubkey ${event.pubkey}:\n${requestedNotes.join('\n')}`;
    } else {
      replyContent = `No notes found for pubkey ${event.pubkey}.`;
    }
  } else if (event.content.includes("/GetImages")) {
    if (imageUrls && imageUrls.length > 0) {
      replyContent = `Here are the images associated with pubkey ${event.pubkey}:\n${imageUrls.join('\n')}`;
    } else {
      replyContent = `No images found for pubkey ${event.pubkey}.`;
    }
  } else {
    // If neither /GetNotes nor /GetImages command is found, send the message to Ollama
    // Prepare the message for Ollama
    const messages = [{ role: "user", content: event.content }];


    // Call the sendMessageToOllama function and await the response
    const ollamaResponse = await sendMessageToOllama(messages);
    console.log("Ollama response received:", ollamaResponse);

    // Verify response structure and extract the content appropriately
    replyContent = typeof ollamaResponse === 'object' && ollamaResponse.hasOwnProperty('replyContent')
      ? ollamaResponse.replyContent
      : "No response generated.";
  }
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
}
export async function processDirectMessage(event, imageUrls, content, pubkey, requestedNotes) {
  console.log("Processing event:", event);
  if (event.kind !== 4) {
    console.error('Not a direct message:', event);
    return;
  }

  let replyContent;

  if (imageUrls && imageUrls.length > 0) {
    replyContent = `Here are the images associated with pubkey ${pubkey}:\n${imageUrls.join('\n')}`;
  } else if (requestedNotes && requestedNotes.length > 0) {
    replyContent = `Here are the notes associated with pubkey ${pubkey}:\n${requestedNotes.join('\n')}`;
  } else {
    // If neither images nor notes are found, send the message to Ollama
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