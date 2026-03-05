const supabase = require('./server/supabaseClient');
async function run() {
    try {
        const { data, error } = await supabase.from('telegram_chats').select('*').limit(1);
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Columns:', Object.keys(data[0] || {}));
            console.log('Sample Data:', data[0]);
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}
run();
