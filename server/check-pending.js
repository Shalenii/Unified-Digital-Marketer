require('dotenv').config();
const supabase = require('./supabaseClient');

async function checkPending() {
    console.log('--- Checking Pending Posts ---');
    const now = new Date();
    console.log('Current Server Time (Local):', now.toString());
    console.log('Current Server Time (ISO):  ', now.toISOString());

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'Pending');

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    console.log(`Found ${posts.length} pending posts.`);

    posts.forEach(post => {
        console.log(`\n[Post ID: ${post.id}]`);
        console.log(`  Scheduled: ${post.scheduled_time}`);

        const scheduledTime = new Date(post.scheduled_time);
        const diff = now - scheduledTime;
        const minutesDiff = Math.floor(diff / 1000 / 60);

        if (diff > 0) {
            console.log(`  STATUS: SHOULD BE PUBLISHED (Overdue by ${minutesDiff} mins)`);
        } else {
            console.log(`  STATUS: EXPETED PENDING (Scheduled for future: in ${Math.abs(minutesDiff)} mins)`);
        }
    });

    if (posts.length === 0) {
        console.log('No pending posts. Check if they are already Published or Failed.');
    }
}

checkPending();
