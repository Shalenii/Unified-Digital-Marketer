const cron = require('node-cron');
const supabase = require('./supabaseClient');

const startCron = () => {
    // RECOVERY: On startup, reset any 'Processing' posts back to 'Pending' 
    // in case the server crashed/restarted while processing.
    (async () => {
        const { error } = await supabase
            .from('posts')
            .update({ status: 'Pending' })
            .eq('status', 'Processing');

        if (error) console.error('Error resetting stuck posts:', error);
        else console.log('Recovery: Reset stuck "Processing" posts to "Pending".');
    })();

    // Run every minute
    cron.schedule('* * * * *', async () => {
        console.log('Running background job: Checking for scheduled posts...');
        const now = new Date().toISOString();

        // Fetch pending posts scheduled for now or earlier
        const { data: rows, error } = await supabase
            .from('posts')
            .select('*')
            .eq('status', 'Pending')
            .lte('scheduled_time', now);

        if (error) {
            console.error('Error fetching pending posts:', error);
            return;
        }

        if (!rows || rows.length === 0) return;

        for (const post of rows) {
            // 1. LOCK: Immediately mark as 'Processing' to prevent next cron from picking it up
            const { error: lockErr } = await supabase
                .from('posts')
                .update({ status: 'Processing' })
                .eq('id', post.id);

            if (lockErr) {
                console.error(`Failed to lock post ${post.id}:`, lockErr);
                continue;
            }

            console.log(`Processing post ID ${post.id}...`);
            const platforms = JSON.parse(post.platforms || '[]');
            const socialManager = require('./services/socialManager');

            // 2. PROCESS: Publish to all platforms
            for (const platform of platforms) {
                try {
                    console.log(`Publishing to ${platform}...`);
                    await socialManager.publish(platform, post);
                    console.log(`Successfully published to ${platform}`);
                } catch (pubError) {
                    console.error(`Failed to publish to ${platform}:`, pubError.message);
                }
            }

            // 3. FINALIZE: Update status to Published
            const { error: updateErr } = await supabase
                .from('posts')
                .update({ status: 'Published' })
                .eq('id', post.id);

            if (updateErr) console.error(`Error finalising post ${post.id}:`, updateErr);
            else console.log(`Post ${post.id} marked as Published.`);

            // 4. RECURRENCE: Schedule next if needed
            if (post.is_recurring) {
                const nextTime = new Date(post.scheduled_time);
                let shouldRecur = true;

                switch (post.recurrence_frequency) {
                    case 'Daily': nextTime.setDate(nextTime.getDate() + 1); break;
                    case 'Weekly': nextTime.setDate(nextTime.getDate() + 7); break;
                    case 'Monthly': nextTime.setMonth(nextTime.getMonth() + 1); break;
                    default: shouldRecur = false;
                }

                const endDate = post.recurrence_end_date ? new Date(post.recurrence_end_date) : null;
                if (endDate && nextTime > endDate) shouldRecur = false;

                if (shouldRecur) {
                    const { error: recurErr } = await supabase
                        .from('posts')
                        .insert([{
                            image_path: post.image_path,
                            caption: post.caption,
                            hashtags: post.hashtags,
                            internal_notes: post.internal_notes,
                            platforms: post.platforms,
                            platform_settings: post.platform_settings,
                            scheduled_time: nextTime.toISOString(),
                            status: 'Pending',
                            is_recurring: true,
                            recurrence_frequency: post.recurrence_frequency,
                            recurrence_end_date: post.recurrence_end_date,
                            source_mode: post.source_mode
                        }]);

                    if (recurErr) console.error('Error creating recurring post:', recurErr);
                    else console.log(`Scheduled next recurring post for ${nextTime.toISOString()}`);
                }
            }
        }
    });
};

module.exports = { startCron };
