import { ws } from "./nostrClient.js";
import { decodePubKey } from "./decodeNpub.js";

// Update URL generator to use primal.net
function generateNoteUrl(noteId) {
  return `https://primal.net/e/${noteId}`;
}

export async function fetchNotes(requestedPubkey, startDate, endDate) {
  console.log('Requested Notes From:', requestedPubkey);

  try {
    const pubkeyHex = decodePubKey(requestedPubkey);
    const notesContent = await fetchEventNotes(pubkeyHex, startDate, endDate);
    console.log('Notes Found:', notesContent);
    return notesContent;
  } catch (error) {
    console.error('Error occurred while fetching Notes:', error);
    return []; // Return an empty array on error
  }
}

async function fetchEventNotes(requestedPubkey, startDate, endDate) {
  return new Promise((resolve, reject) => {
    const subscriptionOptions = {
      kinds: [1],
      authors: [requestedPubkey],
      limit: 100
    };

    if (startDate) {
      subscriptionOptions.since = Math.floor(new Date(startDate).getTime() / 1000);
    }

    if (endDate) {
      subscriptionOptions.until = Math.floor(new Date(endDate).getTime() / 1000);
    }

    const subscription = ["REQ", crypto.randomUUID(), subscriptionOptions];
    const notes = [];

    const onMessage = (data) => {
      const messageString = data.toString();
      try {
        const events = JSON.parse(messageString);
        events.forEach(event => {
          if (event.kind === 1 && event.pubkey === requestedPubkey) {
            notes.push({
              content: event.content,
              created_at: new Date(event.created_at * 1000).toISOString(),
              id: event.id,
              url: generateNoteUrl(event.id)
            });
          }
        });
      } catch (error) {
        console.error(`${new Date().toISOString()} - Error parsing JSON or processing event:`, error);
      }
    };

    ws.on('message', onMessage);
    ws.send(JSON.stringify(subscription));

    setTimeout(() => {
      ws.removeListener('message', onMessage);
      resolve(notes); // Resolve with the contents of the notes
    }, 5000);
  });
}