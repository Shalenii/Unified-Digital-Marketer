require('dotenv').config();
const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function testLocalPub() {
    // You'll need to use your current public ngrok/tunnel URL here if testing locally, 
    // or the Vercel URL if deployed.
    // For now, let's try a direct test with the 3.jpg we found.
    const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    // IF YOU ARE RUNNING LOCALLY, YOU NEED A TUNNEL URL.
    // If you don't have one, this will fail.
    const tunnelUrl = 'https://shalenii.vercel.app'; // Placeholder - replace with your actual URL or tunnel
    const imageUrl = `${tunnelUrl}/source_content/2026-02-06/3.jpg`;

    console.log('Testing with URL:', imageUrl);

    try {
        const res = await axios.post(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
            image_url: imageUrl,
            caption: 'Local Server Test',
            access_token: token
        });
        console.log('SUCCESS:', res.data.id);
    } catch (err) {
        console.error('FAILED:', JSON.stringify(err.response?.data || err.message, null, 2));
    }
}

testLocalPub();
