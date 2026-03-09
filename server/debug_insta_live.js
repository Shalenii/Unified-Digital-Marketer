require('dotenv').config();
const axios = require('axios');
const socialManager = require('./services/socialManager');

async function debugLivePublish() {
    console.log('--- Live Instagram Debug ---');

    // We'll use the image from the failed post 238
    const imageUrl = 'https://powpkqqtxxczxghyhgii.supabase.co/storage/v1/object/public/posts/2026-02-11/image.jpg';
    const caption = 'Live Debug Test ' + new Date().toISOString();

    try {
        console.log('Using image:', imageUrl);
        console.log('Attempting to publish to Instagram...');
        const result = await socialManager.publishToInstagram(caption, imageUrl);
        console.log('--- Publish Result ---');
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('--- Publish Failed ---');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Meta Error:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('Error:', err.message);
            if (err.stack) console.error(err.stack);
        }
    }
}

debugLivePublish().then(() => process.exit(0));
