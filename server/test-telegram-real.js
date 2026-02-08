const https = require('https');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log("=== REAL Telegram Publish Test ===");
console.log(`Bot Token: ${token ? token.substring(0, 5) + '...' : 'MISSING'}`);
console.log(`Chat ID: ${chatId}`);

if (!token || !chatId) {
    console.error("❌ Missing Missing credentials in .env");
    process.exit(1);
}

const message = "Test Message from Scheduler App - " + new Date().toISOString();
const postData = JSON.stringify({
    chat_id: chatId,
    text: message
});

const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
    },
    timeout: 10000
};

console.log("\nAttempting to send request to api.telegram.org...");

const req = https.request(options, (res) => {
    console.log(`Response Status: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.ok) {
                console.log("✅ SUCCESS! Message sent to Telegram.");
                console.log("Check your Telegram channel now.");
            } else {
                console.error("❌ API ERROR:", json.description);
                console.error("Error Code:", json.error_code);
            }
        } catch (e) {
            console.error("❌ RAW RESPONSE (Not JSON):", data);
        }
    });
});

req.on('error', (e) => {
    console.error("❌ NETWORK ERROR:", e.message);
    if (e.code === 'ECONNRESET') console.error("   (Firewall/Proxy blocked connection)");
    if (e.code === 'ETIMEDOUT') console.error("   (Connection timed out)");
});

req.on('timeout', () => {
    console.error("❌ REQUEST TIMEOUT");
    req.destroy();
});

req.write(postData);
req.end();
