import { SimplePool } from 'nostr-tools/pool';
import { nip19 } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

// Initialize WebSocket implementation for Node.js
useWebSocketImplementation(WebSocket);

// Get relays from environment variables or fall back to defaults
export const DEFAULT_RELAYS = process.env.HIVETALK_RELAYS
  ? process.env.HIVETALK_RELAYS.split(',').map(relay => relay.trim())
  : [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band',
      'wss://relay.primal.net'
    ];

// Initialize nostr-tools
export function initNostrTools() {
  // Any global initialization can go here
  // Currently empty as modern nostr-tools doesn't require explicit initialization
}

// Create a new pool instance with cleanup function
export function createPool() {
  const pool = new SimplePool();
  
  // Return both the pool and a cleanup function
  return {
    pool,
    cleanup: () => {
      pool.close(DEFAULT_RELAYS);
    }
  };
}

// Helper function to convert npub to hex format if needed
export function normalizePublicKey(key) {
  if (key.startsWith('npub')) {
    try {
      const { data: hex } = nip19.decode(key);
      return hex;
    } catch (e) {
      console.error('Error decoding npub:', e);
      return key;
    }
  }
  return key;
} 