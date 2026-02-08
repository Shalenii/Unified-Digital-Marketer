const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const test = async () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Pick an image that exists. verified valid_test.png exists from list_dir
    const filename = 'valid_test.png';
    const imagePath = path.join(__dirname, 'uploads', filename);

    console.log("=== Telegram Photo Publish Test ===");
    console.log(`Bot Token: ${botToken ? 'Present' : 'MISSING'}`);
    console.log(`Chat ID: ${chatId}`);
    console.log(`Image Path: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
        console.error("❌ Image file not found!");
        return;
    }

    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', "Test Photo from Antigravity Debug Script");
        form.append('photo', fs.createReadStream(imagePath), { filename });

        console.log("Sending request to Telegram...");
        const response = await axios.post(
            `https://api.telegram.org/bot${botToken}/sendPhoto`,
            form,
            { headers: form.getHeaders() }
        );

        console.log("✅ SUCCESS! Photo sent.");
        console.log("Message ID:", response.data.result.message_id);
    } catch (error) {
        console.error("❌ FAILED to send photo.");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error:", error.message);
        }
    }
};

test();
