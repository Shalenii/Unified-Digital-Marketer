const express = require('express');
const cors = require('cors');

// Provide global fix for IPv6 hanging issues (same as Supabase issue)
require('node:dns').setDefaultResultOrder('ipv4first');
// Load env vars if not in production (Vercel provides them automatically)
// MUST BE AT THE TOP before other imports use process.env
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const multer = require('multer');
const path = require('path');
const { startCron, runCronJob } = require('./cron'); // Renamed to startCron for clarity
const supabase = require('./supabaseClient');
const configService = require('./services/configService');

// Initialize settings
configService.loadSettings().catch(err => console.error('Failed to load settings:', err));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: '*', // Allow all origins (Vercel frontend, local dev, etc.)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve local uploads publicly (Required for Instagram fetch via tunnel)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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
            // Sanitize filename: remove spaces and special characters
            const sanitizedName = req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `${Date.now()}_${sanitizedName}`;
            const fs = require('fs');

            if (process.env.VERCEL) {
                // Production: Upload to Supabase Storage (Read-only filesystem)
                image_path = await uploadToSupabase(req.file.buffer, fileName, req.file.mimetype);
            } else {
                // Local: Save to uploads folder
                const filePath = path.join(__dirname, 'uploads', fileName);
                if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
                    fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
                }
                fs.writeFileSync(filePath, req.file.buffer);
                image_path = fileName;
            }
        } else if (source_mode === 'Auto' && image_path) {
            // AUTO MODE FIX:
            // image_path from client is just "2026-02-11/image.jpg" (local server path)
            // We must read this file and upload to Supabase so everything is unified.
            const fs = require('fs');
            const localFilePath = path.join(__dirname, 'source_content', image_path);

            if (fs.existsSync(localFilePath)) {
                console.log(`[Auto Mode] Uploading local file to Supabase: ${localFilePath}`);
                const fileBuffer = fs.readFileSync(localFilePath);
                // Get mime type (simple check or default to jpeg)
                const ext = path.extname(localFilePath).toLowerCase();
                const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

                if (process.env.VERCEL) {
                    image_path = await uploadToSupabase(fileBuffer, `${Date.now()}_auto_${path.basename(localFilePath)}`, mimeType);
                } else {
                    const fileName = `${Date.now()}_auto_${path.basename(localFilePath)}`;
                    const newPath = path.join(__dirname, 'uploads', fileName);
                    fs.writeFileSync(newPath, fileBuffer);
                    image_path = fileName;
                }
            } else {
                console.warn(`[Auto Mode] Local file not found: ${localFilePath}`);
                // return res.status(400).json({ error: 'Source image not found on server' });
                // We let it proceed, but likely it will fail later or just store the broken path.
                // Better to fail early?
                return res.status(400).json({ error: `Source image not found: ${image_path}` });
            }
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
            const { waitUntil } = require('@vercel/functions');

            // 1. Send immediate response to frontend
            res.json({
                message: 'Post processing started immediately',
                post: { ...post, status: 'Processing' }
            });

            // 2. Wrap the long-running task in waitUntil to prevent Vercel from freezing the instance
            const publishTask = async () => {
                try {
                    const platformList = JSON.parse(platforms || '[]');
                    for (const p of platformList) {
                        console.log(`[Immediate Publish] Attempting to publish to ${p} for post ${post.id}`);
                        await socialManager.publish(p, post);
                    }

                    // Update DB to Published
                    await supabase
                        .from('posts')
                        .update({ status: 'Published' })
                        .eq('id', post.id);

                } catch (pubErr) {
                    console.error('[Immediate Publish Error]:', pubErr.message || pubErr);

                    const errMsg = pubErr.response ? JSON.stringify(pubErr.response.data) : (pubErr.stack || pubErr.message || String(pubErr));
                    await supabase
                        .from('posts')
                        .update({
                            status: 'Failed',
                            internal_notes: `[Vercel Error] ${errMsg}`
                        })
                        .eq('id', post.id);
                }
            };

            // Register background work via Vercel's official utility
            // Note: On local non-Vercel runtimes this acts as a simple background async call.
            if (process.env.VERCEL) {
                waitUntil(publishTask());
            } else {
                publishTask(); // Fast fire-and-forget for local dev testing
            }

        } else {
            res.json({ message: 'Post scheduled successfully', post });
        }

    } catch (err) {
        console.error('Error creating post:', err.message || err);
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


// --- Telegram Endpoints ---
const telegramService = require('./services/telegramService');

// GET /api/telegram/chats - Get all saved Telegram groups/channels
app.get('/api/telegram/chats', async (req, res) => {
    try {
        const chats = await telegramService.getSavedChats();
        res.json({ chats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/telegram/sync - Manually trigger an update fetch
app.post('/api/telegram/sync', async (req, res) => {
    try {
        await telegramService.fetchUpdates();
        res.json({ success: true, message: 'Sync complete' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/telegram/add-chat - Manually add a group ID
app.post('/api/telegram/add-chat', async (req, res) => {
    const { chatId, title, type } = req.body;
    if (!chatId) return res.status(400).json({ error: 'Chat ID is required' });

    try {
        const { error } = await supabase
            .from('telegram_chats')
            .upsert({
                chat_id: chatId,
                type: type || 'group',
                title: title || 'Manual Entry',
                updated_at: new Date().toISOString()
            }, { onConflict: 'chat_id' });

        if (error) throw error;
        res.json({ success: true, message: 'Chat added' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/telegram/chats/:id - Remove a manually added chat
app.delete('/api/telegram/chats/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('telegram_chats')
            .delete()
            .eq('chat_id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Chat deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- WhatsApp Connect Page (served from Railway) ---
// Simple HTML page the user can open to scan QR code directly
app.get('/whatsapp-connect', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect WhatsApp</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f0f2f5; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
        h1 { color: #25D366; margin-top: 0; }
        #qr-container { margin: 1.5rem auto; }
        #status { color: #555; margin-top: 1rem; font-size: 0.9rem; }
        .tag { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; margin-top: 0.5rem; }
        .tag.ready { background: #e8f5e9; color: #2e7d32; }
        .tag.waiting { background: #fff3cd; color: #856404; }
        .tag.connected { background: #d4edda; color: #155724; }
    </style>
</head>
<body>
    <div class="card">
        <h1>📱 Connect WhatsApp</h1>
        <div id="qr-container"></div>
        <div id="status"><span class="tag waiting">⏳ Loading...</span></div>
        <p style="color:#888;font-size:0.8rem">Open WhatsApp → Linked Devices → Link a Device → Scan this code</p>
    </div>
    <script>
        let qrInstance = null;
        async function pollStatus() {
            try {
                const res = await fetch('/api/whatsapp/qr?t=' + Date.now());
                const data = await res.json();
                const statusEl = document.getElementById('status');
                const qrEl = document.getElementById('qr-container');
                if (data.status === 'QR_READY' && data.qrCode) {
                    statusEl.innerHTML = '<span class="tag ready">📷 Scan the QR code below</span>';
                    if (qrInstance) { qrInstance.clear(); qrInstance.makeCode(data.qrCode); }
                    else { qrInstance = new QRCode(qrEl, { text: data.qrCode, width: 220, height: 220 }); }
                } else if (data.status === 'AUTHENTICATED') {
                    qrEl.innerHTML = '<p style="font-size:3rem">✅</p>';
                    statusEl.innerHTML = '<span class="tag connected">WhatsApp Connected!</span>';
                } else if (data.status === 'INITIALIZING') {
                    statusEl.innerHTML = '<span class="tag waiting">⏳ Initializing... please wait</span>';
                } else {
                    statusEl.innerHTML = '<span class="tag waiting">' + data.status + '</span>';
                }
            } catch(e) { console.error(e); }
        }
        pollStatus();
        setInterval(pollStatus, 4000);
    </script>
</body>
</html>`);
});

// --- WhatsApp Endpoints ---
const socialManager = require('./services/socialManager');

// On Vercel, proxy WhatsApp requests to Railway (WhatsApp-web.js needs persistent server)
const RAILWAY_BACKEND = process.env.RAILWAY_BACKEND_URL || 'https://unified-digital-marketer-production.up.railway.app';

const proxyToRailway = async (req, res, path, method = 'GET', body = null) => {
    try {
        const axios = require('axios');
        const config = { method, url: `${RAILWAY_BACKEND}${path}`, timeout: 10000 };
        if (body) { config.data = body; config.headers = { 'Content-Type': 'application/json' }; }
        const response = await axios(config);
        res.json(response.data);
    } catch (error) {
        const msg = error.response?.data || error.message;
        res.status(error.response?.status || 502).json({ error: 'Railway proxy error', detail: msg });
    }
};

// GET /api/whatsapp/qr - Get current QR or status
app.get('/api/whatsapp/qr', async (req, res) => {
    if (process.env.VERCEL) return proxyToRailway(req, res, '/api/whatsapp/qr');
    res.json(socialManager.getWhatsAppStatus());
});

// GET /api/whatsapp/groups - Get all groups
app.get('/api/whatsapp/groups', async (req, res) => {
    if (process.env.VERCEL) return proxyToRailway(req, res, '/api/whatsapp/groups');
    try {
        const groups = await socialManager.getWhatsAppGroups();
        res.json({ groups });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/whatsapp/pair - Request pairing code
app.post('/api/whatsapp/pair', async (req, res) => {
    if (process.env.VERCEL) return proxyToRailway(req, res, '/api/whatsapp/pair', 'POST', req.body);
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });
    try {
        const code = await socialManager.requestWhatsAppPairingCode(phoneNumber);
        res.json({ success: true, code });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/whatsapp/disconnect - Logout and reset session
app.post('/api/whatsapp/disconnect', async (req, res) => {
    if (process.env.VERCEL) return proxyToRailway(req, res, '/api/whatsapp/disconnect', 'POST', {});
    try {
        await socialManager.disconnectWhatsApp();
        res.json({ success: true, message: 'Disconnected' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Admin Utilities ---

// POST /api/admin/reset-stuck - Reset stuck 'Processing' posts to 'Pending'
app.post('/api/admin/reset-stuck', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('posts')
            .update({ status: 'Pending' })
            .eq('status', 'Processing')
            .select();

        if (error) throw error;
        res.json({ success: true, message: `Reset ${data.length} stuck post(s) to Pending.`, posts: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Settings Endpoints ---

// GET /api/settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await configService.getAll();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/settings
app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });

    try {
        await configService.set(key, value);
        res.json({ success: true, message: 'Setting updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Server is running');
});

// DEBUG: Catch-all to inspect what's happening
// DEBUG: Catch-all to inspect what's happening
// In Express 5, '*' is not supported in app.all like this. Use app.use() for 404 fallback.
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found (Catch-all)',
        request_url: req.url,
        request_originalUrl: req.originalUrl,
        request_method: req.method,
        // app._router.stack might be different in structure, let's omit detailed route dumping to be safe
        // or just dump simple info
    });
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

