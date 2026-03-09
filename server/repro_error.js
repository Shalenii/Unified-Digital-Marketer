require('dotenv').config();
const supabase = require('./supabaseClient');
const jimpPkg = require('jimp');
const Jimp = jimpPkg.Jimp || jimpPkg;

(async () => {
    try {
        console.log('Reading image...');
        // Use a small local buffer or a remote one
        const image = new Jimp({ width: 100, height: 100, color: 0xFF0000FF });
        console.log('Getting buffer...');
        const buffer = await image.getBuffer('image/jpeg');
        console.log('Buffer type:', typeof buffer);
        console.log('Is Buffer:', Buffer.isBuffer(buffer));

        console.log('Uploading...');
        const fileName = `test_repro_${Date.now()}.jpg`;
        const { data, error } = await supabase.storage.from('posts').upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
        });

        if (error) {
            console.error('Upload Error:', JSON.stringify(error, null, 2));
        } else {
            console.log('Upload Success:', data);
        }
    } catch (err) {
        console.error('Catch Error:', err);
    }
})();
