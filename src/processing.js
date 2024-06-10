import { sendMessageToOllama } from "./ollamaReq.js";
import { publicKey, privateKey } from "./configs.js";
import { getSignedEvent } from "./eventSigning.js";
import { ws } from "./nostrClient.js";
import { encrypt } from "nostr-tools/nip04";

export async function processTextNote(event, data) {
  const {
    content,
    pubkey,
    requestedPubkey,
    requestedNotes,
    imageUrls,
    activityReport,
    inactiveCuriosity,
  } = data;

  if (content) {
    console.log(
      `${new Date().toISOString()} - Received text note:`,
      event.content
    );
  }

  let replyContent;
  if (inactiveCuriosity) {
    replyContent = inactiveCuriosity;
  } else if (activityReport) {
    replyContent = `Activity report for pubkey ${requestedPubkey}:\n${activityReport}`;
  } else if (imageUrls && imageUrls.length > 0) {
    replyContent = `Here are the images associated with pubkey ${requestedPubkey}:\n${imageUrls.join(
      "\n"
    )}`;
  } else if (Array.isArray(requestedNotes) && requestedNotes.length > 0) {
    replyContent = `Here are the notes associated with pubkey ${requestedPubkey}:\n${requestedNotes.join(
      "\n"
    )}`;
  } else {
    if (requestedNotes === "No notes found") {
      replyContent = "No notes found for the specified pubkey and date range.";
    } else if (imageUrls === "No images found") {
      replyContent = "No images found for the specified pubkey and date range.";
    } else {
      replyContent =
        "No notes or images found for the specified pubkey and date range.";
    }
  }

  console.log("Formatted reply content:", replyContent);

  const replyEvent = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [
      ["e", event.id],
      ["p", event.pubkey],
    ],
    content: replyContent,
  };

  const signedReply = await getSignedEvent(replyEvent, privateKey);
  if (!signedReply) {
    console.error("Failed to sign the reply event.");
    return;
  }

  ws.send(JSON.stringify(["EVENT", signedReply]));
  console.log("Reply sent:", signedReply);
}
export async function processDirectMessage(event, data) {
  const {
    content,
    pubkey,
    requestedNotes,
    requestedPubkey,
    imageUrls,
    activityReport,
  } = data;
  console.log("Processing event:", event);
  console.log("Processing: requestedPubkey:", requestedPubkey);

  if (event.kind !== 4) {
    console.error("Not a direct message:", event);
    return;
  }

  let replyContent;

  if (activityReport) {
    replyContent = `Activity report for pubkey ${requestedPubkey}:\n${activityReport}`;
  } else if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    replyContent = `Here are the images associated with pubkey ${requestedPubkey}:\n${imageUrls.join(
      "\n"
    )}`;
  } else if (Array.isArray(requestedNotes) && requestedNotes.length > 0) {
    replyContent = `Here are the notes associated with pubkey ${requestedPubkey}:\n${requestedNotes.join(
      "\n"
    )}`;
  } else {
    if (imageUrls === "No Images found") {
      replyContent = "No Notes found for the specified pubkey and date range.";
    } else if (requestedNotes && requestedNotes.length === 0) {
      replyContent = "No notes found for the specified pubkey and date range.";
    } else {
      replyContent =
        "No notes or images found for the specified pubkey and date range.";
    }
  }

  console.log("content to be sent as replay:", replyContent);

  // Encrypt the reply content before sending
  const encryptedReplyContent = await encrypt(privateKey, pubkey, replyContent);

  const replyEvent = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 4,
    tags: [["p", pubkey]],
    content: encryptedReplyContent,
  };

  const signedReply = await getSignedEvent(replyEvent, privateKey);

  if (!signedReply) {
    console.error("Failed to sign the reply event.");
    return;
  }

  ws.send(JSON.stringify(["EVENT", signedReply]));
  console.log("Reply sent:", signedReply);
}

export async function processNonCommand(event, data) {
  let { content, pubkey } = data;

  if (event.kind === 1) {
    const npubPattern = /nostr:npub1\w+/g;
    console.log("Content before Npub trimming:", content);
    content = content.replace(npubPattern, "").trim();
  }
  // Send the message to Ollama
  const messages = [{ role: "user", content: content }];
  console.log("Content being sent to Ollama:", content);
  const ollamaResponse = await sendMessageToOllama(messages);
  console.log("Ollama response received:", ollamaResponse);

  const replyContent =
    typeof ollamaResponse === "object" &&
    ollamaResponse.hasOwnProperty("replyContent")
      ? ollamaResponse.replyContent
      : "No response generated.";

  if (event.kind === 1) {
    const replyEvent = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [
        ["e", event.id],
        ["p", event.pubkey],
      ],
      content: replyContent,
    };

    const signedReply = await getSignedEvent(replyEvent, privateKey);
    if (!signedReply) {
      console.error("Failed to sign the reply event.");
      return;
    }

    ws.send(JSON.stringify(["EVENT", signedReply]));
    console.log("Reply sent:", signedReply);
  } else if (event.kind === 4) {
    const encryptedReplyContent = await encrypt(
      privateKey,
      pubkey,
      replyContent
    );
    const replyEvent = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 4,
      tags: [["p", event.pubkey]],
      content: encryptedReplyContent,
    };

    const signedReply = await getSignedEvent(replyEvent, privateKey);
    if (!signedReply) {
      console.error("Failed to sign the reply event.");
      return;
    }

    ws.send(JSON.stringify(["EVENT", signedReply]));
    console.log("Reply sent:", signedReply);
  }
}
