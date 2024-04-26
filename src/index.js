import {publicKey, privateKey, botRole} from "./configs.js"
import { connectWebSocket } from "./nostrClient.js";

console.log('Starting NostrBot');

connectWebSocket();
