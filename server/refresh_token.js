require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * UTILITY: Permanent Token Generator
 * This script helps exchange a short-lived User Token for a Permanent Page Access Token.
 */

async function refreshToken() {
    const appId = '877138891808426';
    const appSecret = '1d2c4810886b670289ad67df12beb421';
    const shortLivedToken = process.argv[2];

    if (!shortLivedToken) {
        console.log('\nUsage: node refresh_token.js <YOUR_SHORT_LIVED_USER_TOKEN>');
        console.log('Get a short-lived token from: https://developers.facebook.com/tools/explorer/\n');
        return;
    }

    try {
        console.log('--- Step 1: Exchanging for Long-Lived User Token ---');
        const userTokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortLivedToken
            }
        });

        const longLivedUserToken = userTokenRes.data.access_token;
        console.log('Success: Got Long-Lived User Token.');

        console.log('\n--- Step 2: Fetching Permanent Page Access Tokens ---');
        const accountsRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
            params: { access_token: longLivedUserToken }
        });

        const accounts = accountsRes.data.data;
        if (!accounts || accounts.length === 0) {
            throw new Error('No Pages found associated with this user token.');
        }

        console.log('Found Pages:');
        accounts.forEach(page => {
            console.log(`- [${page.id}] ${page.name}`);
        });

        const pageId = process.env.FACEBOOK_PAGE_ID;
        const targetPage = accounts.find(p => p.id === pageId) || accounts[0];

        console.log(`\n--- Target Page: ${targetPage.name} [${targetPage.id}] ---`);
        const permanentPageToken = targetPage.access_token;

        console.log('\n===========================================================');
        console.log('PERMANENT PAGE ACCESS TOKEN GENERATED:');
        console.log(permanentPageToken);
        console.log('===========================================================\n');

        console.log('INSTRUCTIONS:');
        console.log('1. Copy the token above.');
        console.log('2. Replace FACEBOOK_PAGE_ACCESS_TOKEN in your .env file.');
        console.log('3. Restart your server.\n');

    } catch (error) {
        console.error('Error refreshing token:', error.response?.data || error.message);
    }
}

refreshToken();
