import { ws } from "./nostrClient.js";

export async function fetchNotes(requestedPubkey, startDate, endDate) {
    console.log('Requested Notes From:', requestedPubkey);
    try {
        const notesContent = await fetchEventNotes(requestedPubkey, startDate, endDate);
        const requestedNotes = notesContent;
        console.log('Notes Found:', requestedNotes); 
      return requestedNotes;
    } catch (error) {
      console.error('Error occurred while fetching Notes:', error);
      return [];  // Return an empty array on error
    }
  }
  

  async function fetchEventNotes(pubkey, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const subscriptionOptions = {
        kinds: [1],
        authors: [pubkey],
        limit: 100
      };
  
      if (startDate) {
        subscriptionOptions.since = Math.floor(new Date(startDate).getTime() / 1000);
      }
  
      if (endDate) {
        subscriptionOptions.until = Math.floor(new Date(endDate).getTime() / 1000);
      }
  
      const subscription = ["REQ", crypto.randomUUID(), subscriptionOptions];
        
      const notesContent = [];  // This will store the content of each note
  
      const onMessage = (data) => {
        const messageString = data.toString();
        try {
          const events = JSON.parse(messageString);
          events.forEach(event => {
            if (event.kind === 1 && event.pubkey === pubkey) {
              notesContent.push(event.content);  // Extracting content from each event
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
        resolve(notesContent);  // Resolve with the contents of the notes
      }, 5000);
    });
  }
  