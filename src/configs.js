import dotenv from 'dotenv';
dotenv.config();

export const publicKey = process.env.PUBLIC_KEY;
if (!publicKey) {
  console.error("Public key is not set. Please check your environment variables.");
  process.exit(1);  // Exit the process if the public key is not available
}
export const privateKey = process.env.PRIVATE_KEY;
console.log('Bot starting with public key:', publicKey);