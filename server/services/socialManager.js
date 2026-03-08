const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
console.log('[SocialManager Debug] __dirname:', __dirname);
console.log('[SocialManager Debug] Requiring ./configService...');
const configService = require('./configService');
console.log('[SocialManager Debug] configService OK');
const supabase = require('../supabaseClient');
const axios = require('axios');
const FormData = require('form-data');
const { TwitterApi } = require('twitter-api-v2');

// WhatsApp dependencies will be lazy-loaded in initializeWhatsApp
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
                const isWin = process.platform === 'win32';
                // Only try 'which' on non-windows systems
                if (!isWin) {
                    const { execSync } = require('child_process');
                    executablePath = execSync('which chromium || which chromium-browser || which google-chrome-stable || which google-chrome', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
                    console.log(`[WhatsApp] Auto-detected Chromium: ${executablePath}`);
                }
            } catch (e) {
                // Silently skip if detection fails
            }
        }
        console.log(`[WhatsApp] Using Chromium from env: ${executablePath}`);

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
try {
    initializeWhatsApp();
} catch (e) {
    console.error('[SocialManager] Failed to start WhatsApp initialization:', e.message);
}
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

const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;

// Helper: Download Image from local storage (or Supabase fallback)
const downloadImage = async (imagePath) => {
    // If it's already a full URL (from Supabase or elsewhere), handle it
    if (imagePath && (imagePath.startsWith('http://') || imagePath.startsWith('https://'))) {
        console.log(`[Storage] Using direct URL: ${imagePath}`);
        const _filename = path.basename(imagePath.split('?')[0]);
        const ext = path.extname(_filename).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
        return { buffer: null, url: imagePath, contentType, isRemote: true };
    }

    const _filename = path.basename(imagePath || '');
    const ext = path.extname(_filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

    // META STABILITY FIX: Always prefer Supabase Public URL for Meta compatibility.
    // Localhost URLs or Vercel preview URLs are often unreachable by Meta's servers.
    console.log(`[Storage] Fetching Supabase Public URL for ${_filename} to ensure Meta compatibility.`);
    const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(_filename);

    // Also check if we have the buffer locally for other platforms (Twitter/WhatsApp/Telegram)
    let buffer = null;
    try {
        const localFilePath = path.join(__dirname, '..', 'uploads', _filename);
        if (fs.existsSync(localFilePath)) {
            buffer = fs.readFileSync(localFilePath);
        }
    } catch (err) {
        console.warn(`[Storage] Could not read local file for buffer: ${err.message}`);
    }

    return { buffer, url: publicUrl, contentType, isRemote: !!publicUrl };
};

const publish = async (platform, post) => {
    try {
        // 1. Fetch Image info
        const { buffer, contentType, url } = await downloadImage(post.image_path);

        if (!url) throw new Error(`Could not resolve image URL for ${platform}`);

        // 2. Extract Platform-Specific Caption Override
        let finalCaption = post.caption;
        try {
            const settings = typeof post.platform_settings === 'string'
                ? JSON.parse(post.platform_settings)
                : (post.platform_settings || {});

            // Check for specific platform override, e.g., settings.Instagram.caption
            if (settings[platform] && settings[platform].caption) {
                console.log(`[Publishing] Using caption override for ${platform}`);
                finalCaption = settings[platform].caption;
            }
        } catch (e) {
            console.warn(`[Publishing] Failed to parse platform_settings for ${platform} caption override.`);
        }

        // 3. Platform Switch
        switch (platform.toLowerCase()) {
            case 'twitter':
                return await publishToTwitter(finalCaption, buffer, contentType, url);
            case 'facebook':
                return await publishToFacebook(finalCaption, buffer, url);
            case 'instagram':
                return await publishToInstagram(finalCaption, url);
            case 'whatsapp':
                return await publishToWhatsApp(finalCaption, buffer, contentType, post.image_path, post, url);
            case 'telegram':
                return await publishToTelegram(finalCaption, buffer, post, url);
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


const publishToTwitter = async (caption, imageBuffer, imageType, publicImageUrl) => {
    const client = getTwitterClient();
    if (!client) throw new Error('Twitter credentials not found in env');

    let fetchBuffer = imageBuffer;
    if (!fetchBuffer && publicImageUrl) {
        console.log(`[Twitter] Downloading deferred buffer from ${publicImageUrl}...`);
        const response = await axios.get(publicImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
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

    // Ensure compliance for Facebook as well
    const compliantUrl = await ensureImageCompliance(publicImageUrl, 'Facebook');

    let fetchBuffer = imageBuffer;
    // CRITICAL BUG FIX: If compliantUrl is different, we MUST re-fetch the buffer
    // otherwise we send the original non-compliant buffer to Facebook.
    if (compliantUrl !== publicImageUrl) {
        console.log(`[Facebook] Compliance required. Re-downloading cropped buffer from ${compliantUrl}...`);
        const response = await axios.get(compliantUrl, { responseType: 'arraybuffer', timeout: 30000 });
        fetchBuffer = Buffer.from(response.data, 'binary');
    } else if (!fetchBuffer && compliantUrl) {
        console.log(`[Facebook] Downloading deferred buffer from ${compliantUrl}...`);
        const response = await axios.get(compliantUrl, { responseType: 'arraybuffer', timeout: 30000 });
        fetchBuffer = Buffer.from(response.data, 'binary');
    }

    try {
        const form = new FormData();
        form.append('message', caption);
        form.append('access_token', token);
        // FormData requires a filename for Buffers
        form.append('source', fetchBuffer, { filename: 'image.jpg' });

        const response = await axios.post(
            `https://graph.facebook.com/${pageId}/photos`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 30000 // 30s timeout
            }
        );

        return { success: true, platform: 'Facebook', id: response.data.id };
    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        if (msg.includes('aspect ratio')) {
            throw new Error(`Facebook aspect ratio error: ${msg}. Even after cropping, Meta rejected it.`);
        }
        if (msg.includes('request limit reached')) {
            throw new Error(`Facebook Rate Limit: ${msg}. Please wait before trying again.`);
        }
        throw new Error(`Facebook failed: ${msg}`);
    }
};

const ensureImageCompliance = async (publicImageUrl, platform = 'Instagram') => {
    try {
        console.log(`[${platform} Compliance] Checking image: ${publicImageUrl}`);

        let Jimp;
        try {
            const jimpPkg = require('jimp');
            Jimp = jimpPkg.Jimp || jimpPkg;
        } catch (jimpLoadErr) {
            console.warn(`[${platform} Compliance] Jimp library not available, skipping resize.`);
            return publicImageUrl;
        }

        if (!Jimp || typeof Jimp.read !== 'function') {
            console.warn(`[${platform} Compliance] Jimp.read not found, skipping resize.`);
            return publicImageUrl;
        }

        const image = await Jimp.read(publicImageUrl);
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const ratio = width / height;

        // Requirements: 0.8 (4:5) to 1.91 (1.91:1)
        if (ratio >= 0.8 && ratio <= 1.91) {
            console.log(`[${platform} Compliance] Image ratio ${ratio.toFixed(2)} is already compliant.`);
            return publicImageUrl;
        }

        console.log(`[${platform} Compliance] Ratio ${ratio.toFixed(2)} is non-compliant. Cropping image...`);

        let cropWidth = width;
        let cropHeight = height;
        let x = 0;
        let y = 0;

        if (ratio < 0.8) {
            // Too tall: Keep width, reduce height to reach 0.8 ratio (height = width / 0.8)
            cropHeight = Math.floor(width / 0.8);
            y = Math.floor((height - cropHeight) / 2);
        } else {
            // Too wide: Keep height, reduce width to reach 1.91 ratio (width = height * 1.91)
            cropWidth = Math.floor(height * 1.91);
            x = Math.floor((width - cropWidth) / 2);
        }

        image.crop(x, y, cropWidth, cropHeight);
        const buffer = await image.getBuffer('image/jpeg');

        // Upload the fixed version to Supabase
        const fileName = `processed_${Date.now()}_${platform.toLowerCase()}.jpg`;
        const { data, error } = await supabase.storage.from('posts').upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
        });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
        console.log(`[${platform} Compliance] New compliant (cropped) image URL: ${publicUrl}`);
        return publicUrl;
    } catch (err) {
        console.error(`[${platform} Compliance] Failed to process image:`, err.message);
        if (err.data) console.error(`[${platform} Compliance] Inner Error Data:`, JSON.stringify(err.data, null, 2));
        if (Array.isArray(err)) console.error(`[${platform} Compliance] Error Array:`, JSON.stringify(err, null, 2));
        return publicImageUrl; // Fallback to original
    }
};

const publishToInstagram = async (caption, publicImageUrl) => {
    const token = configService.get('FACEBOOK_PAGE_ACCESS_TOKEN');
    let igAccountId = configService.get('INSTAGRAM_ACCOUNT_ID');

    // Convert to string safely to handle potential number/precision issues
    if (igAccountId) igAccountId = String(igAccountId);

    if (!token || !igAccountId) {
        throw new Error('Missing FACEBOOK_PAGE_ACCESS_TOKEN or INSTAGRAM_ACCOUNT_ID in .env or settings');
    }

    console.log(`[Instagram Graph API] Account ID: ${igAccountId} (Type: ${typeof igAccountId})`);

    // Ensure compliance
    const compliantUrl = await ensureImageCompliance(publicImageUrl, 'Instagram');

    console.log(`[Instagram Graph API] Preparing to publish to Account ID: ${igAccountId}...`);
    // Add a dummy query param ONLY if Meta might struggle to detect the file type (e.g. no extension)
    const hasExtension = /\.(jpg|jpeg|png)$/i.test(compliantUrl.split('?')[0]);
    const finalImageUrl = hasExtension ? compliantUrl : (compliantUrl.includes('?') ? `${compliantUrl}&type=.jpg` : `${compliantUrl}?type=.jpg`);
    console.log(`[Instagram Graph API] Final Image URL: ${finalImageUrl}`);

    try {
        // Step 1: Create a Media Container
        // Use the body for POST parameters as per modern Meta Graph API standards
        const containerRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media`,
            {
                image_url: finalImageUrl,
                caption: caption,
                access_token: token
            },
            {
                timeout: 30000 // 30s timeout
            }
        );

        const creationId = containerRes.data.id;
        console.log(`[Instagram Graph API] Media container created successfully. ID: ${creationId}`);

        // Step 2: Publish the Container
        // Meta sometimes needs a few seconds to process the image before it's ready to publish.
        // We implement a retry loop with delays.
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let publishRes;
        let attempts = 0;
        const maxAttempts = 5;

        console.log(`[Instagram Graph API] Waiting for Meta to process media...`);
        await sleep(5000); // Initial 5s wait

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`[Instagram Graph API] Publishing attempt ${attempts}/${maxAttempts}...`);
                publishRes = await axios.post(
                    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
                    {
                        creation_id: creationId,
                        access_token: token
                    },
                    {
                        timeout: 30000 // 30s timeout
                    }
                );

                if (publishRes.data.id) {
                    console.log(`[Instagram Graph API] Post published successfully. Published Media ID: ${publishRes.data.id}`);
                    return { success: true, platform: 'Instagram', id: publishRes.data.id };
                }
            } catch (err) {
                const innerMsg = err.response?.data?.error?.message || err.message;
                console.warn(`[Instagram Graph API] Attempt ${attempts} failed: ${innerMsg}`);

                if (attempts < maxAttempts) {
                    console.log(`[Instagram Graph API] Retrying in 5 seconds...`);
                    await sleep(5000);
                } else {
                    throw err; // Out of retries
                }
            }
        }

    } catch (error) {
        let errorMsg = error.response?.data?.error?.message || error.message;
        const detailedError = error.response?.data?.error || error;
        console.error('[Instagram Graph API Error]:', JSON.stringify(detailedError, null, 2));

        if (errorMsg.includes('Invalid image_url') || errorMsg.includes('Invalid URL') || errorMsg.includes('Fetch Image Error') || errorMsg.toLowerCase().includes('fetch')) {
            errorMsg += ' (CRITICAL: Meta servers cannot reach the image URL. Ensure it is a public Supabase URL.)';
        }

        if (errorMsg.includes('request limit reached')) {
            errorMsg = `Meta Rate Limit: ${errorMsg}. Meta has temporarily blocked requests to protect their systems. Please wait at least 1 hour.`;
            console.warn(`[Instagram] RATE LIMIT HIT. Advise user to stop posting for 1-2 hours.`);
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
        const response = await axios.get(publicImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
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
                form.append('photo', fetchBuffer, { filename: 'image.jpg' });

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

const publishToWhatsApp = async (caption, imageBuffer, contentType, originalFilename, post, publicImageUrl) => {
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

    let fetchBuffer = imageBuffer;
    if (!fetchBuffer && publicImageUrl) {
        console.log(`[WhatsApp] Downloading deferred buffer from ${publicImageUrl}...`);
        const response = await axios.get(publicImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        fetchBuffer = Buffer.from(response.data, 'binary');
    }

    // Step 1: Upload the image to Meta's media endpoint to get a media ID
    console.log(`[WhatsApp Cloud API] Uploading image for media ID...`);
    const uploadForm = new FormData();
    uploadForm.append('file', fetchBuffer, { filename: originalFilename || 'image.jpg', contentType });
    uploadForm.append('messaging_product', 'whatsapp');
    uploadForm.append('type', contentType);

    const uploadRes = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/media`,
        uploadForm,
        { headers: { ...uploadForm.getHeaders(), Authorization: `Bearer ${accessToken}` }, timeout: 30000 }
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
                { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
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
    // Skip on Vercel as it doesn't support local session folders anyway
    if (!isVercel) {
        try {
            const fs = require('fs');
            if (fs.existsSync('./whatsapp-session')) {
                fs.rmSync('./whatsapp-session', { recursive: true, force: true });
            }
        } catch (e) {
            console.error("Failed to delete whatsapp-session folder:", e);
        }
    }

    // Give it a second, then reinitialize
    setTimeout(initializeWhatsApp, 1000);
};

module.exports = { publish, getWhatsAppStatus, getWhatsAppGroups, requestWhatsAppPairingCode, disconnectWhatsApp, ensureImageCompliance };

