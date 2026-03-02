const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        await client.connect();
        const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        if (!token) {
            console.error('No token found in .env');
            return;
        }
        const res = await client.query("UPDATE settings SET value = $1 WHERE key = 'FACEBOOK_PAGE_ACCESS_TOKEN'", [token]);
        console.log('Update result:', res.rowCount);
    } catch (e) {
        console.error(e.message);
    } finally {
        await client.end();
        process.exit();
    }
}
run();
