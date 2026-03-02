const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const axios = require('axios');
const fs = require('fs');
const { Client } = require('pg');

(async () => {
    const appId = '849578964790802';
    const appSecret = '0a8151d7c49dc1ac0b81e2bab56107c4';
    const shortToken = 'EAAMEsARnrhIBQ9dHu174ZBIdVCj9hwjNsNH9Y1Be3og7ZCD0ZCvNe6po1k9IQm4jCSxRuzjcokO3uw7ZAVjcZAlNTDZBMMP2YN7f50v1tdFiKb67ogLBT3ZApybfudLBKpebXOZBmSZBwhepFW8t5Y6DHgVhho8gL42Tpkc9RqCL5FhhIXxcJPsB6WVWzI6WkzHsjlXQjVQKUW6G22hvfnv9GpEixoSuPt7eJtQBsmDp8Q4ZA9YCyL969niMsriavOuWHoay0cKF7uQe0dVb3I7h6DMgps';
    const pageId = '996295346906356';

    try {
        // Step 1: Get long-lived user token
        const r1 = await axios.get('https://graph.facebook.com/oauth/access_token', {
            params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken }
        });
        const longUserToken = r1.data.access_token;
        console.log('Long-lived user token acquired. Expires in:', Math.round(r1.data.expires_in / 86400), 'days');

        // Step 2: Get the Page token
        const r2 = await axios.get('https://graph.facebook.com/' + pageId, {
            params: { fields: 'access_token,name,id', access_token: longUserToken }
        });
        const pageToken = r2.data.access_token;
        const pageName = r2.data.name;

        console.log('Page:', pageName, '(ID:', pageId + ')');
        console.log('Page token length:', pageToken.length);

        // Save to file
        fs.writeFileSync('new_page_token.txt', pageToken, 'utf8');
        console.log('Page token saved to new_page_token.txt');

        // Step 3: Update .env file
        let envContent = fs.readFileSync('.env', 'utf8');
        envContent = envContent.replace(
            /FACEBOOK_PAGE_ACCESS_TOKEN=.*/,
            'FACEBOOK_PAGE_ACCESS_TOKEN=' + pageToken
        );
        fs.writeFileSync('.env', envContent, 'utf8');
        console.log('.env updated!');

        // Step 4: Update database settings
        const client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
        const res = await client.query("UPDATE settings SET value = $1 WHERE key = 'FACEBOOK_PAGE_ACCESS_TOKEN'", [pageToken]);
        console.log('Database updated! Rows affected:', res.rowCount);
        await client.end();

        console.log('\nDONE! All locations updated with the new page token.');

    } catch (e) {
        console.error('Error:', JSON.stringify(e.response?.data?.error || e.message, null, 2));
    }
    process.exit();
})();
