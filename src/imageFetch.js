import { ws } from "./nostrClient.js";
import { privateKey, publicKey } from "./configs.js";
import { getSignedEvent } from "./eventSigning.js";
export async function fetchImages(event, requestedPubkey) {
    try {
      const imageEvents = await fetchImageEvents(requestedPubkey);
      const imageUrls = extractImageUrls(imageEvents);
      console.log('URLs Found:', imageUrls)
  
      const replyContent = imageUrls.length > 0
        ? `Here are the images associated with pubkey ${requestedPubkey}:\n\n${imageUrls.join('\n')}`
        : `No images found for pubkey ${requestedPubkey}.`;
  
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
      console.error('Error occurred while fetching images:', error);
    }
  }
  
  async function fetchImageEvents(pubkey) {
    return new Promise((resolve, reject) => {
      const subscription = ["REQ", crypto.randomUUID(), {
        kinds: [1],
        authors: [pubkey],
        limit: 100
      }];
      
      const imageEvents = [];
  
      const onMessage = (data) => {
        const messageString = data.toString();
        try {
          const events = JSON.parse(messageString);
          events.forEach(event => {
            if (event.kind === 1 && event.pubkey === pubkey) {
              imageEvents.push(event);
            }
          });
        } catch (error) {
          console.error(`${new Date().toISOString()} - Error parsing JSON or processing event:`, error);
        }
      };
  
      ws.on('message', onMessage);
      ws.send(JSON.stringify(subscription));
  
      setTimeout(() => {
        ws.off('message', onMessage);
        resolve(imageEvents);
      }, 5000);
    });
  }
  
  function extractImageUrls(events) {
    const imageUrls = [];
  
    events.forEach(event => {
      if (event.content) {
        const urlRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif))/gi;
        const urls = event.content.match(urlRegex);
        if (urls) {
          imageUrls.push(...urls);
        }
      }
    });
  
    return imageUrls;
  }