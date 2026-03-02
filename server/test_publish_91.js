const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function runTest() {
    try {
        await client.connect();

        // Fetch settings from DB
        const settingsRes = await client.query('SELECT key, value FROM settings');
        const settings = {};
        settingsRes.rows.forEach(r => settings[r.key] = r.value);

        // Fetch post 91
        const postRes = await client.query('SELECT * FROM posts WHERE id = 91');
        if (postRes.rows.length === 0) {
            console.error('Post 91 not found');
            return;
        }
        const post = postRes.rows[0];

        console.log('--- Post Details ---');
        console.log('ID:', post.id);
        console.log('Caption:', post.caption);
        console.log('Platforms:', post.platforms);
        console.log('Image Path:', post.image_path);

        const socialManager = require('./services/socialManager');
        const configService = require('./services/configService');

        // Inject settings into configService
        const originalGet = configService.get;
        configService.get = (key) => settings[key] || originalGet(key);

        console.log('\n--- Starting Publish Process ---');
        const result = await socialManager.publish('Instagram', post);
        console.log('\n--- Success! ---');
        console.log('Result:', JSON.stringify(result, null, 2));

        // Update status to Published
        await client.query('UPDATE posts SET status = $1 WHERE id = $2', ['Published', 91]);
        console.log('Database updated: Status set to Published');

    } catch (error) {
        const fs = require('fs');
        console.error('\n--- Failure ---');
        const detailedError = error.response ? JSON.stringify(error.response.data, null, 2) : error.message;
        console.error('Error Details:', detailedError);
        fs.writeFileSync('error_log.txt', `Error: ${detailedError}\nStack: ${error.stack}`);

        // Update status to Failed
        try {
            await client.query('UPDATE posts SET status = $1, internal_notes = $2 WHERE id = $3',
                ['Failed', error.message, 91]);
            console.log('Database updated: Status set to Failed');
        } catch (dbErr) {
            console.error('Failed to update DB after error:', dbErr.message);
        }
    } finally {
        await client.end();
        process.exit();
    }
}

runTest();
