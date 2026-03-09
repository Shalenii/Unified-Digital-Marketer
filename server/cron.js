const cron = require('node-cron');
const supabase = require('./supabaseClient');

// The core logic, extracted so it can be called by API (Vercel Cron) or Node Cron
const runCronJob = async () => {
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

    if (!rows || rows.length === 0) {
        console.log('No pending posts found.');
        return;
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const post of rows) {
        // 1. LOCK: Immediately mark as 'Processing' to prevent next cron from picking it up
        // Ensure atomic update by verifying 'Pending' status
        const { data: lockData, error: lockErr } = await supabase
            .from('posts')
            .update({ status: 'Processing' })
            .eq('id', post.id)
            .eq('status', 'Pending')
            .select();

        if (lockErr || !lockData || lockData.length === 0) {
            if (lockErr) console.error(`Failed to lock post ${post.id}:`, lockErr);
            else console.log(`Skipping post ID ${post.id}: Already locked or processed by another worker.`);
            continue;
        }

        console.log(`Processing post ID ${post.id}...`);
        const platforms = JSON.parse(post.platforms || '[]');
        const socialManager = require('./services/socialManager');

        const results = [];
        const errors = [];

        // 2. PROCESS: Publish to all platforms
        for (const platform of platforms) {
            try {
                console.log(`[Cron] Publishing to ${platform} for post ${post.id}...`);
                await socialManager.publish(platform, post);
                results.push(platform);
                console.log(`[Cron] Successfully published ${post.id} to ${platform}`);

                // Add a small delay between platforms to avoid burst rate limits
                await sleep(2000);
            } catch (pubError) {
                const errMsg = pubError.message || String(pubError);
                console.error(`[Cron Error] Failed to publish ${post.id} to ${platform}: ${errMsg}`);
                errors.push(`${platform}: ${errMsg}`);
            }
        }

        // 3. FINALIZE: Update status with real results
        let finalStatus;
        let finalNotes;

        if (errors.length === 0) {
            finalStatus = 'Published';
            finalNotes = `Published via Cron to: ${results.join(', ')}`;
        } else if (results.length > 0) {
            finalStatus = 'Published'; // Partial success is still "Published" but with notes
            finalNotes = `Partial Success (Cron). OK: ${results.join(', ')} | ERR: ${errors.join('; ')}`;
        } else {
            finalStatus = 'Failed';
            finalNotes = `Scheduled processing failed: ${errors.join('; ')}`;
        }

        console.log(`[Cron] Post ${post.id} final status: ${finalStatus}`);

        const { error: updateErr } = await supabase
            .from('posts')
            .update({
                status: finalStatus,
                internal_notes: finalNotes
            })
            .eq('id', post.id);

        if (updateErr) console.error(`Error finalising post ${post.id}:`, updateErr);
        else console.log(`Post ${post.id} marked as ${finalStatus}.`);

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
};

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

    // Run every minute using node-cron (for local dev or persistent servers)
    cron.schedule('* * * * *', async () => {
        await runCronJob();
    });
};

module.exports = { startCron, runCronJob };
