import crypto from "crypto";

function testEncryptionDecryption() {
    const key = crypto.randomBytes(32); // Ensure the key is appropriate for AES-256
    const iv = crypto.randomBytes(16); // Correct size for AES CBC IV
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const text = 'Test message!';
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    console.log('Decrypted:', decrypted); // This should log 'Test message!'
}

testEncryptionDecryption();
