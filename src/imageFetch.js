import { createPool, DEFAULT_RELAYS } from "./nostrConnection.js";
import { decodePubKey } from "./decodeNpub.js";

function generateNoteUrl(noteId) {
  return `https://primal.net/e/${noteId}`;
}

export async function fetchImages(requestedPubkey, startDate, endDate) {
  console.log('Requested Images From:', requestedPubkey);

  try {
    let pubkeyHex = decodePubKey(requestedPubkey);
    let imageEvents = await fetchImageEvents(pubkeyHex, startDate, endDate);
    let imageData = extractImageData(imageEvents);
    console.log('Image data found:', imageData);
    return imageData;
  } catch (error) {
    console.error('Error occurred while fetching images:', error);
    return []; 
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

    pool.on('message', onMessage);
    pool.send(JSON.stringify(subscription));

    setTimeout(() => {
      pool.off('message', onMessage);
      resolve(imageEvents);
    }, 5000);
  });
}

function extractImageData(events) {
  const imageData = [];
  
  events.forEach(event => {
    if (event.content) {
      try {
        const urlRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif))/gi;
        const urls = event.content.match(urlRegex);
        
        if (urls) {
          urls.forEach(imageUrl => {
            // Ensure all required properties are present
            imageData.push({
              imageUrl: imageUrl,
              created_at: event.created_at * 1000, // Convert to milliseconds
              id: event.id,
              noteUrl: generateNoteUrl(event.id)
            });
          });
        }
      } catch (error) {
        console.error('Error processing event:', error, event);
      }
    }
  });

  // Add debug logging
  console.log('Extracted image data:', imageData);
  
  return imageData.sort((a, b) => b.created_at - a.created_at);
}