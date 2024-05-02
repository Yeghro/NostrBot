import { ws } from "./nostrClient.js";
import { decodePubKey } from "./decodeNpub.js";
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
    const notesContent = []; // This will store the content of each note

    const onMessage = (data) => {
      const messageString = data.toString();
      try {
        const events = JSON.parse(messageString);
        events.forEach(event => {
          if (event.kind === 1 && event.pubkey === requestedPubkey) {
            notesContent.push(event.content); // Extracting content from each event
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
      resolve(notesContent); // Resolve with the contents of the notes
    }, 5000);
  });
}