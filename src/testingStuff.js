import { nip19 } from 'nostr-tools';


const npub = 'npub1lqs30x7466guvx6r2cek8z9d4hpucycy7j08wx58cwx70m206q3qrscejr';

const convertedNpub = nip19.decode(npub);
console.log(convertedNpub);