const express = require('express');
const cors = require('cors');
// Load env vars if not in production (Vercel provides them automatically)
// MUST BE AT THE TOP before other imports use process.env
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const multer = require('multer');
const path = require('path');
const { startCron, runCronJob } = require('./cron'); // Renamed to startCron for clarity
const supabase = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// DEBUG: Log all requests
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
});

// --- CRON Endpoint for Vercel Cron ---
// Try both /api/cron and /cron in case rewrite is behaving unexpectedly
const handleCron = async (req, res) => {
    console.log('Received cron request');
    try {
        await runCronJob();
        res.status(200).json({ message: 'Cron job executed successfully' });
    } catch (error) {
        console.error('Cron job failed:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

app.get('/api/cron', handleCron);
app.get('/cron', handleCron); // Fallback if /api is stripped


// Configure Multer to use Memory Storage (Serverless friendly)
// We will upload to Supabase Storage directly from the buffer.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Helper: Upload to Supabase Storage ---
async function uploadToSupabase(fileBuffer, fileName, contentType) {
    const { data, error } = await supabase
        .storage
        .from('posts') // Ensure this bucket exists!
        .upload(fileName, fileBuffer, {
            contentType: contentType,
            upsert: false
        });

    if (error) throw error;

    // Get Public URL
    const { data: { publicUrl } } = supabase
        .storage
        .from('posts')
        .getPublicUrl(fileName);

    return publicUrl;
}

// --- API Endpoints ---

// GET /api/posts - Retrieve all posts
app.get('/api/posts', async (req, res) => {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ posts: data });
});

// POST /api/posts - Create a new post/schedule
app.post('/api/posts', upload.single('image'), async (req, res) => {
    try {
        const {
            caption, hashtags, internal_notes, platforms, platform_settings,
            scheduled_time, is_recurring, recurrence_frequency, recurrence_end_date, source_mode,
            is_immediate
        } = req.body;

        let image_path = req.body.image_path; // Can be passed if reusing an image

        // Handle File Upload
        if (req.file) {
            const fileName = `${Date.now()}_${req.file.originalname}`;
            // Upload to Supabase Storage
            const publicUrl = await uploadToSupabase(req.file.buffer, fileName, req.file.mimetype);
            // We store the full Public URL or the path. Storing the URL is easier for client.
            image_path = fileName; // We store filename to keep DB clean, client constructs URL or we return it.
            // Actually, for Supabase integration, let's store the FILENAME, and client constructs URL using bucket.
            // OR store full URL. Let's store FILENAME to match existing logic slightly better, 
            // but the Client needs to know it's a Supabase file.
            // Let's store the FILENAME.
        }

        if (!image_path || !scheduled_time || !platforms) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Status is 'Processing' if immediate, else 'Pending'
        const initialStatus = (is_immediate === 'true' || is_immediate === true) ? 'Processing' : 'Pending';

        const { data, error } = await supabase
            .from('posts')
            .insert([{
                image_path,
                caption,
                hashtags,
                internal_notes,
                platforms,
                platform_settings,
                scheduled_time,
                status: initialStatus,
                is_recurring: (is_recurring === 'true' || is_recurring === true),
                recurrence_frequency,
                recurrence_end_date: recurrence_end_date || null,
                source_mode
            }])
            .select() // Return the created row
            .single();

        if (error) throw error;

        const post = data;

        // If immediate, trigger publishing logic NOW
        if (initialStatus === 'Processing') {
            const socialManager = require('./services/socialManager');

            // Fire-and-forget response
            res.json({
                message: 'Post published immediately',
                post: { ...post, status: 'Published' }
            });

            // Start background processing
            (async () => {
                try {
                    const platformList = JSON.parse(platforms || '[]');
                    for (const p of platformList) {
                        await socialManager.publish(p, post);
                    }

                    // Update DB to Published
                    await supabase
                        .from('posts')
                        .update({ status: 'Published' })
                        .eq('id', post.id);

                } catch (pubErr) {
                    console.error('[Background] Immediate publish failed:', pubErr);
                    await supabase
                        .from('posts')
                        .update({ status: 'Failed' })
                        .eq('id', post.id);
                }
            })();
        } else {
            res.json({ message: 'Post scheduled successfully', post });
        }

    } catch (err) {
        console.error('Error creating post:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Post deleted' });
});

// PATCH /api/posts/:id/status
app.patch('/api/posts/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const { error } = await supabase
        .from('posts')
        .update({ status })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: `Post status updated to ${status}` });
});

// PATCH /api/posts/:id
app.patch('/api/posts/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Clean up updates object to only allow specific fields
    const allowedFields = ['caption', 'scheduled_time', 'status', 'is_recurring'];
    const safeUpdates = {};
    Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) safeUpdates[key] = updates[key];
    });

    const { error } = await supabase
        .from('posts')
        .update(safeUpdates)
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Post updated' });
});

// Export app for Vercel
module.exports = app;

// Start Server strictly if running directly (not required for Vercel, but good for local dev)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        startCron();
    });
}

