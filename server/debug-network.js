const https = require('https');
const dns = require('dns');

console.log("=== Network Diagnostic Tool ===");

// 1. Check DNS resolution for Telegram
console.log("\n1. Testing DNS Resolution for api.telegram.org...");
dns.lookup('api.telegram.org', (err, address, family) => {
    if (err) {
        console.error("❌ DNS Lookup FAILED:", err.code);
        console.error("   Message:", err.message);
        console.log("   Potential Cause: No internet or DNS blocked.");
    } else {
        console.log("✅ DNS Lookup SUCCESS");
        console.log(`   Address: ${address} (IPv${family})`);

        // 2. Check TCP Connection
        console.log("\n2. Testing TCP Connection to api.telegram.org:443...");
        const req = https.request({
            hostname: 'api.telegram.org',
            port: 443,
            path: '/',
            method: 'GET', // Changed HEAD to GET to provoke a full response/error
            timeout: 10000 // Increased timeout
        }, (res) => {
            console.log(`✅ TCP Connection SUCCESS (Status: ${res.statusCode})`);
            res.resume(); // Consume response to free memory
        });

        req.on('error', (e) => {
            console.error("❌ TCP Connection FAILED");
            console.error(`   Error Code: ${e.code}`);
            console.error(`   Message: ${e.message}`);

            if (e.code === 'ECONNRESET') console.log("   Cause: Connection forcibly closed by peer (firewall/proxy).");
            if (e.code === 'ETIMEDOUT') console.log("   Cause: Firewall dropping packets or slow connection.");
            if (e.code === 'ECONNREFUSED') console.log("   Cause: Port blocked or server down.");
        });

        req.on('timeout', () => {
            console.error("❌ Request TIMED OUT");
            req.destroy();
        });

        req.end();
    }
});
