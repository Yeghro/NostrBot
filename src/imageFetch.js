import { ws } from "./nostrClient.js";
import { nip19 } from "nostr-tools";

export async function fetchImages(requestedPubkey, startDate, endDate) {
  try {
      let pubkeyHex = requestedPubkey;
  
      if (requestedPubkey.startsWith('npub')) {
        const { type, data } = nip19.decode(requestedPubkey);
        if (type === 'npub') {
          pubkeyHex = data;
        } else {
          throw new Error('Invalid npub');
        }
      } else if (requestedPubkey.startsWith('nostr:npub')) {
        const { type, data } = nip19.decode(requestedPubkey.slice(6));
        if (type === 'npub') {
          pubkeyHex = data;
        } else {
          throw new Error('Invalid nostr:npub');
        }
      }
  
    const imageEvents = await fetchImageEvents(pubkeyHex, startDate, endDate);
    const imageUrls = extractImageUrls(imageEvents);
    console.log('URLs Found:', imageUrls);
    return imageUrls;
  } catch (error) {
    console.error('Error occurred while fetching images:', error);
    return []; // Return an empty array in case of an error
  }
}

async function fetchImageEvents(requestedPubkey, startDate, endDate) {
  return new Promise((resolve, reject) => {
    const filters = {
      kinds: [1],
      authors: [requestedPubkey],
      limit: 100
    };

    if (startDate) {
      filters.since = Math.floor(new Date(startDate).getTime() / 1000);
    }

    if (endDate) {
      filters.until = Math.floor(new Date(endDate).getTime() / 1000);
    }

    const subscription = ["REQ", crypto.randomUUID(), filters];
    const imageEvents = [];

    const onMessage = (data) => {
      const messageString = data.toString();
      try {
        const events = JSON.parse(messageString);
        events.forEach(event => {
          if (event.kind === 1 && event.pubkey === requestedPubkey) {
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