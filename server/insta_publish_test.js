const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { publish } = require('./services/socialManager');
const fs = require('fs');

const log = (msg) => {
    const line = new Date().toISOString() + ' | ' + msg;
    console.log(line);
    fs.appendFileSync('insta_test_output.txt', line + '\n');
};

const testPost = {
    id: 9999,
    caption: 'Live Test - Image Compliance Flow Verification',
    hashtags: '',
    image_path: 'https://powpkqqtxxczxghyhgii.supabase.co/storage/v1/object/public/posts/test_real_1773065714168.jpg',
    platforms: JSON.stringify(['Instagram']),
    platform_settings: '{}'
};

async function run() {
    log('--- Instagram Publish Test Starting ---');
    try {
        const result = await publish('Instagram', testPost);
        log('SUCCESS: ' + JSON.stringify(result));
    } catch (err) {
        if (err.response) {
            log('ERROR Status: ' + err.response.status);
            log('ERROR DATA: ' + JSON.stringify(err.response.data));
        } else {
            log('ERROR: ' + err.message);
        }
    }
    log('--- Test Complete ---');
}

run().then(() => process.exit(0)).catch(e => { log('CRASH: ' + e.message); process.exit(1); });
