import { ws } from "./nostrClient.js";
import crypto from "crypto";
import { decodePubKey } from "./decodeNpub.js";

export async function checkFollowListActivity(requestedPubkey) {
  console.log("Requested public key for check:", requestedPubkey);
  try {
    const decodedPubkey = decodePubKey(requestedPubkey);
    console.log("Decoded public key for check:", decodedPubkey);

    const kind3Event = await fetchKind3Event(decodedPubkey);
    console.log("Kind 3 events received:", kind3Event);

    if (!kind3Event || !Array.isArray(kind3Event.tags)) {
      console.error("No valid kind 3 event found or tags are not iterable.");
      return "No valid kind 3 event found for the target public key.";
    }

    const response = [];
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const sixMonthsAgo = currentTimestamp - 180 * 24 * 60 * 60;

    const batchSize = 1000; // Adjust the batch size as needed
    const pubkeys = kind3Event.tags
      .filter((tag) => tag[0] === "p" && tag.length >= 2)
      .map((tag) => tag[1]);
    const batches = [];

    for (let i = 0; i < pubkeys.length; i += batchSize) {
      batches.push(pubkeys.slice(i, i + batchSize));
    }

    const pendingRequests = new Map();
    let completedRequests = 0;

    const onMessage = (data) => {
      const event = JSON.parse(data.toString());
      if (event[0] === "EVENT" && event[2].kind === 1) {
        const pubkey = event[2].pubkey;
        const createdAt = event[2].created_at;
        console.log("Timestamp per key:", pubkey, createdAt);
        pendingRequests.set(pubkey, createdAt); // Store the timestamp in the map
        completedRequests++;

        if (completedRequests === pubkeys.length) {
          ws.removeListener("message", onMessage);
        }
      }
    };

    ws.on("message", onMessage);

    try {
      for (const batch of batches) {
        const promises = batch.map((pubkey) => {
          return new Promise((resolve) => {
            const filter = { kinds: [1], authors: [pubkey], limit: 1 };
            ws.send(JSON.stringify(["REQ", crypto.randomUUID(), filter]));

            setTimeout(() => {
              resolve();
            }, 20000); // Adjust the timeout as needed
          });
        });

        await Promise.all(promises);

        for (const pubkey of batch) {
          const lastNoteTimestamp = pendingRequests.get(pubkey);
          console.log("Last note Timestamps:", lastNoteTimestamp);
          console.log("Stored in PendingRequests:", pendingRequests);
          if (lastNoteTimestamp === undefined) {
            response.push(`No notes found for ${pubkey}`);
          } else if (lastNoteTimestamp < sixMonthsAgo) {
            response.push(`${pubkey} last posted more than 6 months ago`);
          }
        }
      }
    } catch (error) {
      console.error("Error checking follow list activity:", error);
      ws.removeListener("message", onMessage);
      return "An error occurred while checking follow list activity.";
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
        if (
          event[0] === "EVENT" &&
          filter.kinds.includes(event[2].kind) &&
          filter.authors.includes(event[2].pubkey)
        ) {
          resolve(event[2]);
        }
      };

      ws.send(JSON.stringify(["REQ", crypto.randomUUID(), filter]));
      ws.once("message", onMessage);

      setTimeout(() => {
        ws.removeListener("message", onMessage);
        reject(new Error("Timeout reached without receiving an event"));
      }, 20000); // Timeout, adjust as needed
    });
  } catch (error) {
    console.error("Error fetching kind 3 event:", error);
    return null;
  }
}
