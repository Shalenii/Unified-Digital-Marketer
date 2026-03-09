require('dotenv').config();
const { runCronJob } = require('./cron');
const supabase = require('./supabaseClient');

async function verifyScheduling() {
    console.log('--- Verifying Scheduling Logic ---');

    // 1. Create a "dummy" pending post scheduled for NOW
    const now = new Date();
    const testPost = {
        image_path: 'https://powpkqqtxxczxghyhgii.supabase.co/storage/v1/object/public/posts/2026-02-11/image.jpg',
        caption: 'Scheduling Verification Test',
        platforms: '["Telegram"]', // Use Telegram as it's least likely to rate-limit or fail on aspect ratio for simple tests
        scheduled_time: now.toISOString(),
        status: 'Pending',
        internal_notes: 'Automated verification post'
    };

    console.log('Creating test post...');
    const { data: post, error } = await supabase.from('posts').insert([testPost]).select().single();

    if (error) {
        console.error('Failed to create test post:', error);
        return;
    }

    console.log(`Created test post ID: ${post.id}. Running cron job...`);

    // 2. Run the cron job
    try {
        await runCronJob();
        console.log('Cron job run completed.');

        // 3. Verify the post status was updated
        const { data: updatedPost } = await supabase.from('posts').select('*').eq('id', post.id).single();
        console.log('Updated Post Status:', updatedPost.status);
        console.log('Internal Notes:', updatedPost.internal_notes);

        if (updatedPost.status !== 'Pending') {
            console.log('SUCCESS: Cron job picked up and processed the post.');
        } else {
            console.error('FAILURE: Post is still Pending.');
        }
    } catch (err) {
        console.error('Cron job execution failed:', err);
    } finally {
        // Cleanup: Optional - we can leave it for the user to see, or delete it
        // await supabase.from('posts').delete().eq('id', post.id);
    }
}

verifyScheduling().then(() => process.exit(0));
