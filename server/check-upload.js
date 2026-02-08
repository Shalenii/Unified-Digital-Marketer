require('dotenv').config();
const supabase = require('./supabaseClient');

async function check() {
    const { error } = await supabase.storage.from('posts').upload('check.txt', 'test');
    if (error) {
        console.log('ERROR_MSG:', error.message);
        console.log('ERROR_STATUS:', error.statusCode);
    } else {
        console.log('SUCCESS');
    }
}
check();
