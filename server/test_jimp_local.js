const { Jimp } = require('jimp');
async function run() {
    try {
        console.log('Jimp version:', Jimp);
        const image = await Jimp.read(Buffer.alloc(100)); // Should fail but show if Jimp works
    } catch (e) {
        console.log('Got expected error or verification:', e.message);
    }
}
run();
