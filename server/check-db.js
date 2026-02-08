require('dotenv').config();
const supabase = require('./supabaseClient');

async function checkDatabase() {
    console.log('🔄 Connecting to Supabase...');
    console.log(`📡 URL: ${process.env.SUPABASE_URL}`);

    const { count, error } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ CONNECTION FAILED:', error.message);
    } else {
        console.log('✅ CONNECTION SUCCESSFUL!');
        console.log(`📊 Found ${count} posts in the database.`);
    }
}

checkDatabase();
