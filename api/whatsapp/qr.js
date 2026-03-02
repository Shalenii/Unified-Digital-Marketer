// Dedicated Vercel function: proxies /api/whatsapp/qr directly to Railway
// This overrides the catch-all api/index.js for this specific route

const RAILWAY_URL = process.env.RAILWAY_BACKEND_URL || 'https://unified-digital-marketer-production.up.railway.app';

module.exports = async (req, res) => {
    // Set no-cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const https = require('https');
        const url = new URL(`${RAILWAY_URL}/api/whatsapp/qr`);

        const data = await new Promise((resolve, reject) => {
            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            };
            const request = https.request(options, (response) => {
                let body = '';
                response.on('data', chunk => body += chunk);
                response.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Invalid JSON from Railway')); }
                });
            });
            request.on('error', reject);
            request.setTimeout(8000, () => { request.destroy(); reject(new Error('Railway timeout')); });
            request.end();
        });

        res.status(200).json(data);
    } catch (error) {
        res.status(502).json({ status: 'FAILED', error: error.message, railway: RAILWAY_URL });
    }
};
