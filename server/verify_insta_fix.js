require('dotenv').config();
const socialManager = require('./services/socialManager');
const supabase = require('./supabaseClient');

async function testCompliance() {
    console.log('--- Testing Image Compliance Logic ---');

    // We'll try to grab a real image from the database if possible
    let testImageUrl = 'https://powpkqqtxxczxghyhgii.supabase.co/storage/v1/object/public/posts/2026-02-11/image.jpg';

    try {
        console.log('Fetching a recent post to test with...');
        const { data, error } = await supabase.from('posts').select('image_path').limit(1).single();
        if (data && data.image_path) {
            testImageUrl = data.image_path;
            console.log('Using real image from DB:', testImageUrl);
        }
    } catch (e) {
        console.warn('Could not fetch real image from DB, using fallback.');
    }

    try {
        console.log('Running ensureImageCompliance...');
        const compliantUrl = await socialManager.ensureImageCompliance(testImageUrl, 'Instagram');
        console.log('Result URL:', compliantUrl);

        if (compliantUrl !== testImageUrl) {
            console.log('SUCCESS: Image was processed/cropped.');
        } else {
            console.log('NOTE: Image was already compliant or processing was skipped.');
        }
    } catch (err) {
        console.error('Compliance test failed:', err);
    }
}

async function runTests() {
    try {
        await testCompliance();
    } catch (e) {
        console.error('Test run error:', e);
    }
    process.exit(0);
}

runTests();
