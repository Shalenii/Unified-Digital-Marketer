const fs = require('fs');
const content = fs.readFileSync('error_log.txt', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    console.log(`L${i + 1}: ${line}`);
});
