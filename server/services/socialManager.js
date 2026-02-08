const axios = require('axios');
const FormData = require('form-data');
const { TwitterApi } = require('twitter-api-v2');
const supabase = require('../supabaseClient');

// Helper: Download Image from Supabase to Buffer
const downloadImage = async (imagePath) => {
    // If it's a full URL (Auto mode might send this?), use it. 
    // If it's just a filename (Manual mode), construct Supabase URL or download via SDK.

    // We stored just the filename in DB.
    // Let's try downloading via SDK for security/ease, or just fetch the public URL.
    // Fetching public URL is easiest if bucket is public.

    const { data } = supabase.storage.from('posts').getPublicUrl(imagePath);
    const publicUrl = data.publicUrl;

    console.log(`[DEBUG] Downloading image from: ${publicUrl}`);

    try {
        const response = await axios.get(publicUrl, { responseType: 'arraybuffer' });
        return {
            buffer: Buffer.from(response.data),
            contentType: response.headers['content-type'],
            url: publicUrl
        };
    } catch (error) {
        throw new Error(`Failed to download image from Supabase: ${error.message}`);
    }
};

// Initialize Twitter Client (v2)
const getTwitterClient = () => {
    if (!process.env.TWITTER_APP_KEY) return null;
    return new TwitterApi({
        appKey: process.env.TWITTER_APP_KEY,
        appSecret: process.env.TWITTER_APP_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
};

const publishToTwitter = async (caption, imageBuffer, imageType) => {
    const client = getTwitterClient();
    if (!client) throw new Error('Twitter credentials not found in env');

    try {
        // 1. Upload media (Buffer)
        // Twitter API v2 accepts Buffer directly
        const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: imageType });

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

const publishToFacebook = async (caption, imageBuffer) => {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const pageId = process.env.FACEBOOK_PAGE_ID;

    if (!token || !pageId) throw new Error('Facebook credentials not found in env');

    try {
        const form = new FormData();
        form.append('message', caption);
        form.append('access_token', token);
        // FormData requires a filename for Buffers
        form.append('source', imageBuffer, { filename: 'image.jpg' });

        const response = await axios.post(
            `https://graph.facebook.com/${pageId}/photos`,
            form,
            { headers: form.getHeaders() }
        );

        return { success: true, platform: 'Facebook', id: response.data.id };
    } catch (error) {
        throw new Error(`Facebook failed: ${error.response?.data?.error?.message || error.message}`);
    }
};

const publishToInstagram = async (caption, imageUrl) => {
    // Instagram Graph API *REQUIRES* a public URL. 
    // Since we are using Supabase, we HAVE a public URL! Perfect.

    const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!accountId || !token) {
        throw new Error('Missing Instagram Credentials');
    }

    console.log(`[Instagram] uploading URL: ${imageUrl}`);

    try {
        // Step 1: Create Media Container
        const containerRes = await axios.post(
            `https://graph.facebook.com/v18.0/${accountId}/media`,
            null,
            {
                params: {
                    image_url: imageUrl,
                    caption: caption,
                    access_token: token
                }
            }
        );

        const containerId = containerRes.data.id;
        console.log(`[Instagram] Container Created: ${containerId}`);

        // Step 2: Publish Container
        const publishRes = await axios.post(
            `https://graph.facebook.com/v18.0/${accountId}/media_publish`,
            null,
            {
                params: {
                    creation_id: containerId,
                    access_token: token
                }
            }
        );

        return { success: true, platform: 'Instagram', id: publishRes.data.id };

    } catch (error) {
        console.error('Instagram API Error:', error.response?.data || error.message);
        throw new Error(`Instagram failed: ${error.response?.data?.error?.message || error.message}`);
    }
};

const publishToTelegram = async (caption, imageBuffer) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) throw new Error('Telegram credentials not found in env');

    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', caption);
        form.append('photo', imageBuffer, { filename: 'image.jpg' });

        const response = await axios.post(
            `https://api.telegram.org/bot${botToken}/sendPhoto`,
            form,
            { headers: form.getHeaders() }
        );

        if (response.data.ok) {
            return { success: true, platform: 'Telegram', id: response.data.result.message_id };
        } else {
            throw new Error(`Telegram Error: ${response.data.description}`);
        }
    } catch (error) {
        throw new Error(`Telegram failed: ${error.message}`);
    }
};

const publish = async (platform, post) => {
    try {
        // Fetch Image from Supabase
        // post.image_path is just the filename now (e.g., "172...jpg")
        const { buffer, contentType, url } = await downloadImage(post.image_path);

        switch (platform.toLowerCase()) {
            case 'twitter':
                return await publishToTwitter(post.caption, buffer, contentType);
            case 'facebook':
                return await publishToFacebook(post.caption, buffer);
            case 'instagram':
                // Instgram needs URL, not buffer
                return await publishToInstagram(post.caption, url);
            case 'telegram':
                return await publishToTelegram(post.caption, buffer);
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

module.exports = { publish };

