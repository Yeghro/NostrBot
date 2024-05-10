import { ws } from "./nostrClient.js";
import crypto from 'crypto';
import { decodePubKey } from "./decodeNpub.js";

export async function checkFollowListActivity(requestedPubkey) {
  console.log("Requested public key for check:", requestedPubkey);
  try {
    const decodedPubkey = decodePubKey(requestedPubkey);
    console.log("Decoded public key for check:", decodedPubkey);

    const kind3Event = await fetchKind3Event(decodedPubkey);
    console.log('Kind 3 events received:', kind3Event);

    if (!kind3Event || !Array.isArray(kind3Event.tags)) {
      console.error("No valid kind 3 event found or tags are not iterable.");
      return "No valid kind 3 event found for the target public key.";
    }

    const response = [];
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const sixMonthsAgo = currentTimestamp - 180 * 24 * 60 * 60;

    const batchSize = 100; // Adjust the batch size as needed
    const pubkeys = kind3Event.tags.filter(tag => tag[0] === "p" && tag.length >= 2).map(tag => tag[1]);
    const batches = [];
    console.log('batch list:', batches);

    for (let i = 0; i < pubkeys.length; i += batchSize) {
      batches.push(pubkeys.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map(pubkey => getLastNoteTimestamp(pubkey)));

      for (let i = 0; i < batch.length; i++) {
        const followedPubkey = batch[i];
        const lastNoteTimestamp = batchResults[i];

        if (lastNoteTimestamp === null) {
          response.push(`No notes found for ${followedPubkey}`);
        } else if (lastNoteTimestamp < sixMonthsAgo) {
          response.push(`${followedPubkey} last posted more than 6 months ago`);
        }
      }
    }

    if (response.length === 0) {
      response.push("All followed pubkeys have posted within the last 6 months");
    }

    return response.join("\n");
  } catch (error) {
    console.error("Error checking follow list activity:", error);
    return "An error occurred while checking follow list activity.";
  }
}

async function fetchKind3Event(decodedPubkey) {
  try {
    const filter = { kinds: [3], authors: [decodedPubkey], limit: 1 };
    return new Promise((resolve, reject) => {
      const onMessage = (data) => {
        const event = JSON.parse(data.toString());
        if (event[0] === "EVENT" && filter.kinds.includes(event[2].kind) && filter.authors.includes(event[2].pubkey)) {
          resolve(event[2]);
        }
      };

      ws.send(JSON.stringify(["REQ", crypto.randomUUID(), filter]));
      ws.once("message", onMessage); // Use 'once' instead of 'on'

      setTimeout(() => {
        ws.removeListener("message", onMessage);
        reject(new Error("Timeout reached without receiving an event"));
      }, 20000); // Increase the timeout to 60 seconds or adjust as needed
    });
  } catch (error) {
    console.error("Error fetching kind 3 event:", error);
    return null;
  }
}

async function getLastNoteTimestamp(pubkey) {
  try {
    const filter = { kinds: [1], authors: [pubkey], limit: 1 };
    return new Promise((resolve) => {
      const onMessage = (data) => {
        const event = JSON.parse(data.toString());
        if (event[0] === "EVENT" && filter.kinds.includes(event[2].kind) && filter.authors.includes(event[2].pubkey)) {
          resolve(event[2].created_at);
        }
      };

      console.log('Filter for pubkeys:', filter);
      ws.send(JSON.stringify(["REQ", crypto.randomUUID(), filter]));
      ws.on("message", onMessage); // Use 'once' instead of 'on'

      setTimeout(() => {
        ws.removeListener("message", onMessage);
        resolve(null); // Resolve with null if no event is received within the timeout
      }, 20000); // Increase the timeout to 60 seconds or adjust as needed
    });
  } catch (error) {
    console.error("Error fetching last note timestamp:", error);
    return null;
  }
}
