const https = require('https');

const url = 'https://unified-digital-marketer.vercel.app/api/cron';

console.log(`Fetching ${url}...`);

https.get(url, (res) => {
    console.log('Status Code:', res.statusCode);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response Body:');
        console.log(data);
    });

}).on('error', (err) => {
    console.error('Error:', err.message);
});
