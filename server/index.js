require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const db = require('./database');
const { startCronParams } = require('./cron');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
// Serve uploaded images statically
// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/source_content', express.static(path.join(__dirname, 'source_content')));
const fs = require('fs');

// GET /api/source-images - List images from server/source_content/YYYY-MM-DD
app.get('/api/source-images', (req, res) => {
    const dateStr = req.query.date; // Expect YYYY-MM-DD
    if (!dateStr) {
        return res.status(400).json({ error: 'Date query param required (YYYY-MM-DD)' });
    }

    const sourceDir = path.join(__dirname, 'source_content', dateStr);

    if (!fs.existsSync(sourceDir)) {
        // Create it if it doesn't exist so user can drop files there
        fs.mkdirSync(sourceDir, { recursive: true });
        return res.json({ images: [] });
    }

    fs.readdir(sourceDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // Filter for images (Exclude SVG as most platforms don't support it)
        const images = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
        res.json({ images });
    });
});

// Configure Multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// API Endpoints

// GET /api/posts - Retrieve all posts
app.get('/api/posts', (req, res) => {
    db.all('SELECT * FROM posts ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ posts: rows });
    });
});

// POST /api/posts - Create a new post/schedule
app.post('/api/posts', upload.single('image'), (req, res) => {
    const {
        caption, hashtags, internal_notes, platforms, platform_settings,
        scheduled_time, is_recurring, recurrence_frequency, recurrence_end_date, source_mode,
        is_immediate
    } = req.body;

    // For manual upload, we use req.file. For Auto mode (future), we might just pass a path string.
    const image_path = req.file ? req.file.filename : req.body.image_path;

    if (!image_path || !scheduled_time || !platforms) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Status is 'Processing' if immediate, else 'Pending'
    const initialStatus = (is_immediate === 'true' || is_immediate === true) ? 'Processing' : 'Pending';

    const sql = `INSERT INTO posts (
        image_path, caption, hashtags, internal_notes, platforms, platform_settings,
        scheduled_time, status, is_recurring, recurrence_frequency, recurrence_end_date, source_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        image_path, caption, hashtags, internal_notes, platforms, platform_settings,
        scheduled_time, initialStatus, (is_recurring === 'true' || is_recurring === true) ? 1 : 0, recurrence_frequency, recurrence_end_date, source_mode
    ];

    db.run(sql, params, async function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const postId = this.lastID;
        const post = {
            id: postId,
            image_path, caption, hashtags, internal_notes, platforms, platform_settings,
            scheduled_time, status: initialStatus, is_recurring, recurrence_frequency, recurrence_end_date, source_mode
        };

        // If immediate, trigger publishing logic NOW
        if (initialStatus === 'Processing') {
            console.log(`[DEBUG] Immediate publish triggered for Post ${postId}`);
            console.log(`[DEBUG] Post Data:`, JSON.stringify(post, null, 2));

            const platformList = JSON.parse(platforms || '[]');
            const socialManager = require('./services/socialManager');

            // OPTIMIZATION: Respond immediately (Fire-and-forget) to make UI feel instant
            // Optimistically return "Published" so the UI updates immediately.
            // The background job will handle the actual work and DB update.
            res.json({
                message: 'Post published immediately',
                post: { ...post, status: 'Published' }
            });

            // Start background processing
            (async () => {
                try {
                    for (const p of platformList) {
                        console.log(`[DEBUG] Attempting to publish to ${p}...`);
                        await socialManager.publish(p, post);
                        console.log(`[DEBUG] Successfully published to ${p}`);
                    }

                    // Update DB to Published
                    db.run(`UPDATE posts SET status = 'Published' WHERE id = ?`, [postId], (upErr) => {
                        if (upErr) console.error('Error updating immediate post status:', upErr);
                        console.log(`[DEBUG] Post ${postId} background updated to Published`);
                    });
                } catch (pubErr) {
                    console.error('[DEBUG] Immediate publish background failed:', pubErr);
                    console.error('[DEBUG] Stack:', pubErr.stack);
                    // Mark as Failed
                    db.run(`UPDATE posts SET status = 'Failed' WHERE id = ?`, [postId]);
                    // Cannot send res.status(500) because response is already sent
                }
            })();
        } else {
            // Normal Schedule
            res.json({
                message: 'Post scheduled successfully',
                post
            });
        }
    });
});


// DELETE /api/posts/:id - Delete a post
app.delete('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM posts WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Post deleted', changes: this.changes });
    });
});

// PATCH /api/posts/:id/status - Update post status (Pause/Resume)
app.patch('/api/posts/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Expect 'Pending' or 'Paused'

    if (!['Pending', 'Paused'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    db.run('UPDATE posts SET status = ? WHERE id = ?', [status, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Post status updated to ${status}`, changes: this.changes });
    });
});

// PATCH /api/posts/:id - Generic Update (for is_recurring, etc.)
app.patch('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Whitelist allowed fields
    const allowedFields = ['caption', 'scheduled_time', 'status', 'is_recurring'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No valid permissible fields to update' });
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    values.push(id);

    const sql = `UPDATE posts SET ${setClause} WHERE id = ?`;

    db.run(sql, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Post updated', changes: this.changes });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start the background job
    startCronParams();
});
