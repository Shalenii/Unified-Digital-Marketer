require('dotenv').config();
const socialManager = require('./services/socialManager');
const post = {
    id: 9999,
    caption: 'Test Post - Live Debugging after deployment',
    hashtags: '',
    image_path: 'https://powpkqqtxxczxghyhgii.supabase.co/storage/v1/object/public/posts/1773069917501_M.png',
    platforms: JSON.stringify(['Instagram'])
};
(async () => {
    try {
        console.log('Starting publish...');
        const res = await socialManager.publish('Instagram', post);
        console.log('SUCCESS:', res);
    } catch (e) {
        console.error('FAILED:', e.message);
    }
})();
