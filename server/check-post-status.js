const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const supabase = require('./supabaseClient');

async function checkStatus() {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error('Error fetching post:', error);
    } else {
        console.log('Latest Post:', data);
    }
}

checkStatus();
