const cron = require('node-cron');
const db = require('./database');

const startCronParams = () => {
    // RECOVERY: On startup, reset any 'Processing' posts back to 'Pending' 
    // in case the server crashed/restarted while processing.
    db.run(`UPDATE posts SET status = 'Pending' WHERE status = 'Processing'`, (err) => {
        if (err) console.error('Error resetting stuck posts:', err);
        else console.log('Recovery: Reset stuck "Processing" posts to "Pending".');
    });

    // Run every minute
    cron.schedule('* * * * *', () => {
        console.log('Running background job: Checking for scheduled posts...');
        const now = new Date().toISOString();

        db.all(
            `SELECT * FROM posts WHERE status = 'Pending' AND scheduled_time <= ?`,
            [now],
            (err, rows) => {
                if (err) {
                    console.error('Error fetching pending posts:', err);
                    return;
                }

                if (rows.length === 0) return;

                rows.forEach(async (post) => {
                    // 1. LOCK: Immediately mark as 'Processing' to prevent next cron from picking it up
                    db.run(`UPDATE posts SET status = 'Processing' WHERE id = ?`, [post.id], async (lockErr) => {
                        if (lockErr) {
                            console.error(`Failed to lock post ${post.id}:`, lockErr);
                            return;
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
                        db.run(
                            `UPDATE posts SET status = 'Published' WHERE id = ?`,
                            [post.id],
                            (updateErr) => {
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
                                        const nextSql = `INSERT INTO posts (
                                            image_path, caption, hashtags, internal_notes, platforms, platform_settings,
                                            scheduled_time, status, is_recurring, recurrence_frequency, recurrence_end_date, source_mode
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', 1, ?, ?, ?)`;

                                        const nextParams = [
                                            post.image_path, post.caption, post.hashtags, post.internal_notes, post.platforms, post.platform_settings,
                                            nextTime.toISOString(), post.recurrence_frequency, post.recurrence_end_date, post.source_mode
                                        ];

                                        db.run(nextSql, nextParams, (recurErr) => {
                                            if (recurErr) console.error('Error creating recurring post:', recurErr);
                                            else console.log(`Scheduled next recurring post for ${nextTime.toISOString()}`);
                                        });
                                    }
                                }
                            }
                        );
                    });
                });
            }
        );
    });
};

module.exports = { startCronParams };
