const supabase = require('./supabaseClient');
require('dotenv').config();

(async () => {
    try {
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .ilike('platforms', '%instagram%')
            .eq('status', 'Failed')
            .order('id', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error fetching posts:', error);
            process.exit(1);
        }

        console.log('--- FAILED INSTAGRAM POSTS ---');
        data.forEach(post => {
            console.log(`ID: ${post.id}`);
            console.log(`Created: ${post.scheduled_time}`);
            console.log(`Internal Notes: ${post.internal_notes}`);
            console.log('---------------------------');
        });
        process.exit(0);
    } catch (err) {
        console.error('Execution error:', err);
        process.exit(1);
    }
})();
