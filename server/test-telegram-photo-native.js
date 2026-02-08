const https = require('https');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const test = async () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Pick an image that exists.
    const filename = 'valid_test.png';
    const imagePath = path.join(__dirname, 'uploads', filename);

    console.log("=== Telegram Photo Publish Test (Native HTTPS) ===");
    console.log(`Bot Token: ${botToken ? 'Present' : 'MISSING'}`);
    console.log(`Chat ID: ${chatId}`);
    console.log(`Image Path: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
        console.error("❌ Image file not found!");
        return;
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', "Test Photo from Native HTTPS Script");
    form.append('photo', fs.createReadStream(imagePath), { filename });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendPhoto`,
        method: 'POST',
        headers: form.getHeaders()
    };

    console.log("Sending request to Telegram...");

    const req = https.request(options, (res) => {
        console.log(`Response Status: ${res.statusCode}`);
        let data = '';

        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.ok) {
                    console.log("✅ SUCCESS! Photo sent.");
                    console.log("Message ID:", json.result.message_id);
                } else {
                    console.error("❌ API ERROR:", json.description);
                }
            } catch (e) {
                console.error("❌ RAW RESPONSE:", data);
            }
        });
    });

    req.on('error', (e) => {
        console.error("❌ NETWORK ERROR:", e.message);
    });

    form.pipe(req);
};

test();
