export function hexToBytes(hex) {
    return Uint8Array.from(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  }
  
export function bytesToHex(bytes) {
    return Array.from(bytes).reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");
  }
  
export function base64ToHex(str) {
    const raw = atob(str);
    let result = '';
    for (let i = 0; i < raw.length; i++) {
      const hex = raw.charCodeAt(i).toString(16);
      result += (hex.length === 2 ? hex : '0' + hex);
    }
    return result;
  }
  
export  function hexToString(hexStr) {
    var hex = hexStr.toString();  //force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function displayReadableContent(decryptedMessage) {
  let readableText = hexToString(decryptedMessage);
  console.log('Readable content:', readableText);
}