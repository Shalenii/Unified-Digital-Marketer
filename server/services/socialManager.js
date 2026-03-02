const configService = require('./configService');
const supabase = require('../supabaseClient');
const axios = require('axios');
const FormData = require('form-data');
const { TwitterApi } = require('twitter-api-v2');
// WhatsApp dependencies will be lazy-loaded in initializeWhatsApp

// --- WhatsApp Client Initialization ---
let whatsappClient = null;
let isWhatsAppReady = false;
let currentQrCode = null;
let authStatus = 'INITIALIZING'; // 'INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'FAILED'

const initializeWhatsApp = () => {
    // VERCEL CHECK: WhatsApp-web.js requires Puppeteer which doesn't work out of the box on Vercel serverless.
    if (process.env.VERCEL) {
        console.warn('[WhatsApp] Skipping automatic initialization on Vercel environment.');
        authStatus = 'NOT_SUPPORTED_ON_VERCEL';
        return;
    }

    try {
        const { Client, LocalAuth } = require('whatsapp-web.js');
        const qrcode = require('qrcode-terminal');

        console.log('[WhatsApp] Initializing client...');
        // Auto-detect system Chromium path (for Railway/Linux)
        let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        if (!executablePath) {
            try {
                const { execSync } = require('child_process');
                executablePath = execSync('which chromium || which chromium-browser || which google-chrome-stable || which google-chrome').toString().trim();
                console.log(`[WhatsApp] Auto-detected Chromium: ${executablePath}`);
            } catch (e) {
                console.log('[WhatsApp] No system Chromium found, using Puppeteer bundled browser.');
                executablePath = undefined;
            }
        } else {
            console.log(`[WhatsApp] Using Chromium from env: ${executablePath}`);
        }

        whatsappClient = new Client({
            authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            },
            puppeteer: {
                executablePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                ],
            }
        });

        whatsappClient.on('qr', (qr) => {
            currentQrCode = qr;
            authStatus = 'QR_READY';
            qrcode.generate(qr, { small: true });
        });

        whatsappClient.on('ready', () => {
            console.log('[WhatsApp] Client is ready and connected!');
            isWhatsAppReady = true;
            authStatus = 'AUTHENTICATED';
            currentQrCode = null;
        });

        whatsappClient.on('authenticated', () => {
            console.log('[WhatsApp] Authenticated successfully!');
            authStatus = 'AUTHENTICATED';
            currentQrCode = null;
        });

        whatsappClient.on('auth_failure', msg => {
            console.error('[WhatsApp] Authentication failure:', msg);
            isWhatsAppReady = false;
            authStatus = 'FAILED';
        });

        whatsappClient.on('disconnected', (reason) => {
            console.log('[WhatsApp] Client was disconnected', reason);
            isWhatsAppReady = false;
        });

        whatsappClient.initialize().catch(err => {
            console.error('[WhatsApp] Failed to initialize:', err);
            authStatus = 'FAILED';
        });
    } catch (err) {
        console.error('[WhatsApp] Error during Client setup:', err.message);
        authStatus = 'FAILED';
    }
};

// Initialize it immediately in background (if allowed)
initializeWhatsApp();
// -------------------------------------

// Initialize Twitter Client (v2)
const getTwitterClient = () => {
    const appKey = configService.get('TWITTER_APP_KEY');
    if (!appKey) return null;
    return new TwitterApi({
        appKey: appKey,
        appSecret: configService.get('TWITTER_APP_SECRET'),
        accessToken: configService.get('TWITTER_ACCESS_TOKEN'),
        accessSecret: configService.get('TWITTER_ACCESS_SECRET'),
    });
};

// ... (rest of the file needs updates too)


const fs = require('fs');
const path = require('path');

// Helper: Download Image from local storage (or Supabase fallback)
const downloadImage = async (imagePath) => {
    // If it's already a full URL (from Supabase or elsewhere), handle it
    if (imagePath && (imagePath.startsWith('http://') || imagePath.startsWith('https://'))) {
        console.log(`[Storage] Using direct URL: ${imagePath}`);
        // We defer the buffer download here to avoid 504 timeouts on Vercel when publishing to Instagram
        // Instagram only needs the URL string, it does NOT need the buffer. Downloading a 5MB image into memory
        // inside a Serverless function kills Vercel's free tier time allotment.
        return {
            buffer: null, // Defer loading
            url: imagePath,
            isRemote: true
        };
    }

    let baseUrl = configService.get('PUBLIC_URL') || 'http://localhost:3001';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const publicUrl = `${baseUrl}/uploads/${encodeURIComponent(imagePath)}`;

    try {
        const _filename = path.basename(imagePath);
        const localFilePath = path.join(__dirname, '..', 'uploads', _filename);
        if (!fs.existsSync(localFilePath)) throw new Error(`File not found: ${localFilePath}`);
        const buffer = fs.readFileSync(localFilePath);
        return {
            buffer,
            contentType: path.extname(_filename).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
            url: publicUrl
        };
    } catch (error) {
        throw new Error(`Failed to load image: ${error.message}`);
    }
};



const publishToTwitter = async (caption, imageBuffer, imageType, publicImageUrl) => {
    const client = getTwitterClient();
    if (!client) throw new Error('Twitter credentials not found in env');

    let fetchBuffer = imageBuffer;
    if (!fetchBuffer && publicImageUrl) {
        console.log(`[Twitter] Downloading deferred buffer from ${publicImageUrl}...`);
        const response = await axios.get(publicImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        fetchBuffer = Buffer.from(response.data, 'binary');
    }

    try {
        // 1. Upload media (Buffer)
        // Twitter API v2 accepts Buffer directly
        const mediaId = await client.v1.uploadMedia(fetchBuffer, { mimeType: imageType });

        // 2. Tweet with media
        await client.v2.tweet({
            text: caption,
            media: { media_ids: [mediaId] }
        });

        return { success: true, platform: 'Twitter' };
    } catch (error) {
        console.error('Twitter Upload Error:', error);
        throw new Error(`Twitter failed: ${error.message}`);
    }
};

const publishToFacebook = async (caption, imageBuffer, publicImageUrl) => {
    const token = configService.get('FACEBOOK_PAGE_ACCESS_TOKEN');
    const pageId = configService.get('FACEBOOK_PAGE_ID');

    if (!token || !pageId) throw new Error('Facebook credentials not found in env');

    let fetchBuffer = imageBuffer;
    if (!fetchBuffer && publicImageUrl) {
        console.log(`[Facebook] Downloading deferred buffer from ${publicImageUrl}...`);
        const response = await axios.get(publicImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        fetchBuffer = Buffer.from(response.data, 'binary');
    }

    try {
        const form = new FormData();
        form.append('message', caption);
        form.append('access_token', token);
        // FormData requires a filename for Buffers
        form.append('source', imageBuffer, { filename: 'image.jpg' });

        const response = await axios.post(
            `https://graph.facebook.com/${pageId}/photos`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 15000 // 15s timeout
            }
        );

        return { success: true, platform: 'Facebook', id: response.data.id };
    } catch (error) {
        throw new Error(`Facebook failed: ${error.response?.data?.error?.message || error.message}`);
    }
};

const publishToInstagram = async (caption, publicImageUrl) => {
    const token = configService.get('FACEBOOK_PAGE_ACCESS_TOKEN');
    const igAccountId = configService.get('INSTAGRAM_ACCOUNT_ID');

    if (!token || !igAccountId) {
        throw new Error('Missing FACEBOOK_PAGE_ACCESS_TOKEN or INSTAGRAM_ACCOUNT_ID in .env or settings');
    }

    console.log(`[Instagram Graph API] Preparing to publish to Account ID: ${igAccountId}...`);
    console.log(`[Instagram Graph API] Image URL for Meta Servers: ${publicImageUrl}`);

    try {

        // Step 1: Create a Media Container
        // Add a dummy query param to the URL to force Meta to recognize it as an image file
        // Sometimes localtunnel/ngrok headers obscure the content type, so Meta rejects it without a clear extension
        const finalImageUrl = publicImageUrl.includes('?') ? `${publicImageUrl}&type=.jpg` : `${publicImageUrl}?type=.jpg`;

        const containerRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media`,
            '',
            {
                params: {
                    image_url: finalImageUrl,
                    caption: caption,
                    access_token: token
                }
            }
        );

        const creationId = containerRes.data.id;
        console.log(`[Instagram Graph API] Media container created successfully. ID: ${creationId}`);

        // Step 2: Publish the Container
        const publishRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
            '',
            {
                params: {
                    creation_id: creationId,
                    access_token: token
                }
            }
        );

        console.log(`[Instagram Graph API] Post published successfully. Published Media ID: ${publishRes.data.id}`);
        return { success: true, platform: 'Instagram', id: publishRes.data.id };

    } catch (error) {
        let errorMsg = error.response?.data?.error?.message || error.message;
        console.error('[Instagram Graph API Error]:', error.response?.data?.error || error);

        if (errorMsg.includes('Invalid image_url') || errorMsg.includes('Invalid URL') || errorMsg.includes('Fetch Image Error') || errorMsg.toLowerCase().includes('fetch')) {
            errorMsg += ' (CRITICAL: Meta servers cannot reach localhost. Please ensure your PUBLIC_URL in .env is set to a real ngrok URL like https://xxxx.ngrok-free.app)';
        }

        throw new Error(`Instagram Official API failed: ${errorMsg}`);
    }
};

const publishToTelegram = async (caption, imageBuffer, post, publicImageUrl) => {
    console.log('[Telegram] publishToTelegram called.');
    const botToken = configService.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) throw new Error('Telegram Bot Token not found in env');

    let fetchBuffer = imageBuffer;
    if (!fetchBuffer && publicImageUrl) {
        console.log(`[Telegram] Downloading deferred buffer from ${publicImageUrl}...`);
        const response = await axios.get(publicImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        fetchBuffer = Buffer.from(response.data, 'binary');
    }

    let chatIds = [];

    // 1. Check for specific chat IDs selected in the frontend UI (Groups/Channels)
    try {
        const platformSettings = typeof post.platform_settings === 'string'
            ? JSON.parse(post.platform_settings)
            : (post.platform_settings || {});

        if (platformSettings.Telegram && platformSettings.Telegram.chatIds && platformSettings.Telegram.chatIds.length > 0) {
            chatIds = platformSettings.Telegram.chatIds;
            console.log(`[Telegram] Found ${chatIds.length} chatIds in platform_settings:`, chatIds);
        }
    } catch (e) {
        console.warn('[Telegram] Could not parse platform_settings for chatIds.');
    }

    // 2. Automatically grab all ALL private users who have interacted with the bot (Autobroadcast)
    try {
        const telegramService = require('./telegramService');
        const privateUserIds = await telegramService.getAllPrivateChatIds();
        console.log(`[Telegram Broadcast] Adding ${privateUserIds.length} private users to broadcast list.`);
        chatIds = [...chatIds, ...privateUserIds];
    } catch (err) {
        console.warn('[Telegram] Failed to fetch private users for broadcast:', err.message);
    }

    // 3. Fallback to the environment variable TELEGRAM_CHAT_ID ONLY if the list is still completely empty
    if (chatIds.length === 0) {
        const chatIdsStr = configService.get('TELEGRAM_CHAT_ID');
        if (chatIdsStr) {
            chatIds = chatIdsStr.split(',').map(id => id.trim()).filter(Boolean);
        }
    }

    // Deduplicate chatIds
    chatIds = [...new Set(chatIds)];

    if (chatIds.length === 0) throw new Error('No valid Telegram Chat IDs found.');

    console.log(`[Telegram Broadcast] Starting broadcast to ${chatIds.length} targets...`);

    let successCount = 0;
    let lastId = null;
    let errors = [];

    // Parallel broadcasting with concurrency limit to respect Telegram's limits (~30/sec)
    const BATCH_SIZE = 15; // Faster batches
    const DELAY_BETWEEN_BATCHES = 500; // ms

    const sendToChat = async (chatId) => {
        const maxRetries = 1;
        let attempt = 0;
        let currentChatId = chatId;

        while (attempt <= maxRetries) {
            try {
                const form = new FormData();
                form.append('chat_id', currentChatId);
                form.append('caption', caption);
                form.append('photo', imageBuffer, { filename: 'image.jpg' });

                const response = await axios.post(
                    `https://api.telegram.org/bot${botToken}/sendPhoto`,
                    form,
                    {
                        headers: form.getHeaders(),
                        timeout: 15000 // 15s timeout
                    }
                );

                if (response.data.ok) {
                    lastId = response.data.result.message_id;
                    successCount++;
                    return; // Success
                } else {
                    throw new Error(response.data.description);
                }
            } catch (error) {
                const errorMsg = error.response?.data?.description || error.message;

                // Group ID Auto-healing: If "chat not found" and it looks like a supergroup ID missing -100
                if (errorMsg.toLowerCase().includes('chat not found') && attempt === 0) {
                    const idStr = String(currentChatId);
                    let healedId = null;

                    // Case 1: ID is like 5020601636 (no prefix)
                    if (!idStr.startsWith('-') && idStr.length >= 7) {
                        healedId = `-100${idStr}`;
                    }
                    // Case 2: ID is like -5020601636 (missing 100)
                    else if (idStr.startsWith('-') && !idStr.startsWith('-100') && idStr.length >= 8) {
                        healedId = `-100${idStr.substring(1)}`;
                    }

                    if (healedId) {
                        console.log(`[Telegram] Healing Chat ID ${currentChatId} -> ${healedId}`);
                        currentChatId = healedId;
                        attempt++;
                        continue;
                    }
                }

                errors.push(`Chat ${chatId}: ${errorMsg}`);
                return; // Give up on this chat
            }
        }
    };

    // Process in batches
    for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
        const batch = chatIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(id => sendToChat(id)));

        if (i + BATCH_SIZE < chatIds.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }

    console.log(`[Telegram Broadcast] Finished. Success: ${successCount}, Failed: ${errors.length}`);

    if (successCount === 0 && chatIds.length > 0) {
        throw new Error(`Telegram failed to send to any chats. Errors: ${errors.slice(0, 3).join(' | ')}...`);
    } else if (errors.length > 0) {
        console.warn(`[Telegram] Partially succeeded, but failed for some: ${errors.slice(0, 5).join(' | ')}`);
    }

    return {
        success: true,
        platform: 'Telegram',
        id: lastId,
        partialErrors: errors.length > 0 ? errors : undefined
    };
};

const publishToWhatsApp = async (caption, imageBuffer, contentType, originalFilename, post) => {
    const accessToken = configService.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = configService.get('WHATSAPP_PHONE_NUMBER_ID');

    if (!accessToken || accessToken === 'your_whatsapp_access_token') {
        throw new Error('WhatsApp Business API credentials (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID) are not configured.');
    }

    // Collect target phone numbers from platform settings
    let targetNumbers = [];

    try {
        const platformSettings = typeof post.platform_settings === 'string'
            ? JSON.parse(post.platform_settings)
            : (post.platform_settings || {});

        if (platformSettings.WhatsApp && platformSettings.WhatsApp.numbers) {
            targetNumbers = platformSettings.WhatsApp.numbers.split(',')
                .map(n => n.trim().replace(/\+/g, '').replace(/[^0-9]/g, ''))
                .filter(Boolean);
        }
    } catch (e) {
        console.warn('[WhatsApp Cloud] Could not parse platform_settings for numbers.');
    }

    // Fallback to env
    if (targetNumbers.length === 0) {
        const envNumber = configService.get('WHATSAPP_TO_PHONE');
        if (envNumber) targetNumbers = [envNumber.replace(/[^0-9]/g, '')];
    }

    if (targetNumbers.length === 0) {
        throw new Error('No WhatsApp phone numbers specified. Add numbers in post settings or set WHATSAPP_TO_PHONE in env.');
    }

    // Step 1: Upload the image to Meta's media endpoint to get a media ID
    console.log(`[WhatsApp Cloud API] Uploading image for media ID...`);
    const uploadForm = new FormData();
    uploadForm.append('file', imageBuffer, { filename: originalFilename || 'image.jpg', contentType });
    uploadForm.append('messaging_product', 'whatsapp');
    uploadForm.append('type', contentType);

    const uploadRes = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/media`,
        uploadForm,
        { headers: { ...uploadForm.getHeaders(), Authorization: `Bearer ${accessToken}` } }
    );
    const mediaId = uploadRes.data.id;
    console.log(`[WhatsApp Cloud API] Got media ID: ${mediaId}`);

    // Step 2: Send image + caption to each phone number
    const fullCaption = caption;
    let successCount = 0;
    const errors = [];

    for (const number of targetNumbers) {
        try {
            await axios.post(
                `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: number,
                    type: 'image',
                    image: { id: mediaId, caption: fullCaption }
                },
                { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
            );
            console.log(`[WhatsApp Cloud API] Sent to ${number} ✅`);
            successCount++;
        } catch (err) {
            const errMsg = err.response?.data?.error?.message || err.message;
            console.error(`[WhatsApp Cloud API] Failed to send to ${number}:`, errMsg);
            errors.push(`${number}: ${errMsg}`);
        }
    }

    if (successCount === 0) {
        throw new Error(`WhatsApp Cloud API failed for all numbers. Errors: ${errors.join(' | ')}`);
    }

    return { success: true, platform: 'WhatsApp', id: mediaId, partialErrors: errors.length > 0 ? errors : undefined };
};

const publish = async (platform, post) => {
    try {
        // Fetch Image from Supabase
        // post.image_path is just the filename now (e.g., "172...jpg")
        const { buffer, contentType, url } = await downloadImage(post.image_path);

        switch (platform.toLowerCase()) {
            case 'twitter':
                return await publishToTwitter(post.caption, buffer, contentType, url);
            case 'facebook':
                return await publishToFacebook(post.caption, buffer, url);
            case 'instagram':
                // Instgram needs URL, not buffer
                return await publishToInstagram(post.caption, url);
            case 'whatsapp':
                // WhatsApp-web.js needs buffer
                return await publishToWhatsApp(post.caption, buffer, contentType, post.image_path, post);
            case 'telegram':
                return await publishToTelegram(post.caption, buffer, post, url);
            default:
                throw new Error(`Platform ${platform} not supported`);
        }
    } catch (error) {
        // Mock Success fallback for development/demo if Config is missing
        const isCredentialError = error.message.includes('credentials not found') || error.message.includes('Missing Instagram');

        if (isCredentialError) {
            console.log(`[MOCK PUBLISH] Platform: ${platform}, Caption: "${post.caption}"`);
            console.log(`(Real publishing skipped. Error: ${error.message})`);
            return { success: true, platform, id: 'mock-id-' + Date.now(), mocked: true };
        }

        throw error;
    }
};

// --- New WhatsApp Helper Functions for UI ---
const getWhatsAppStatus = () => {
    return {
        status: authStatus,
        qrCode: currentQrCode
    };
};

const getWhatsAppGroups = async () => {
    if (!whatsappClient || !isWhatsAppReady) {
        throw new Error('WhatsApp is not ready. Please connect via Settings first.');
    }
    const chats = await whatsappClient.getChats();
    // Filter to only return groups
    const groups = chats.filter(chat => chat.isGroup).map(chat => ({
        id: chat.id._serialized,
        name: chat.name
    }));
    return groups;
};

const requestWhatsAppPairingCode = async (phoneNumber) => {
    if (!whatsappClient) {
        throw new Error('WhatsApp client is not initialized.');
    }

    try {
        // whatsapp-web.js requires the number to be cleaned (numbers only, no + or spaces)
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

        // CRITICAL FIX: The library fails to expose this function to the browser if the phone
        // number wasn't provided at startup. We dynamically inject it here before requesting!
        try {
            await whatsappClient.pupPage.exposeFunction('onCodeReceivedEvent', (code) => {
                return code;
            });
        } catch (e) {
            // Function is already exposed (safe to ignore)
        }

        console.log(`[WhatsApp] Requesting pairing code for ${cleanNumber}`);
        const code = await whatsappClient.requestPairingCode(cleanNumber);
        return code;
    } catch (error) {
        console.error('[WhatsApp] Pairing code error:', error);
        throw new Error(`Failed to request pairing code: ${error.message}`);
    }
};

const disconnectWhatsApp = async () => {
    console.log('[WhatsApp] Disconnecting client...');
    if (whatsappClient) {
        try {
            await whatsappClient.logout();
            await whatsappClient.destroy();
        } catch (err) {
            console.error('Error during logout/destroy:', err);
        }
    }
    whatsappClient = null;
    isWhatsAppReady = false;
    currentQrCode = null;
    authStatus = 'INITIALIZING';

    // Completely wipe the unneeded session folder to force a clean re-auth
    try {
        const fs = require('fs');
        if (fs.existsSync('./whatsapp-session')) {
            fs.rmSync('./whatsapp-session', { recursive: true, force: true });
        }
    } catch (e) {
        console.error("Failed to delete whatsapp-session folder:", e);
    }

    // Give it a second, then reinitialize
    setTimeout(initializeWhatsApp, 1000);
};

module.exports = { publish, getWhatsAppStatus, getWhatsAppGroups, requestWhatsAppPairingCode, disconnectWhatsApp };

