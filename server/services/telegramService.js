const axios = require('axios');
const supabase = require('../supabaseClient');
const configService = require('./configService');

class TelegramService {
    constructor() {
        this.isPolling = false;
        this.lastUpdateId = 0;
        this.isFetching = false;
    }

    startPolling() {
        if (this.isPolling) return;

        console.log('[TelegramService] Starting polling for updates...');
        this.isPolling = true;

        // Use a continuous loop for long polling so we acknowledge updates immediately
        const pollLoop = async () => {
            while (this.isPolling) {
                console.log('[TelegramService] Heartbeat: Starting update cycle...');
                await this.fetchUpdates();
                // Brief pause to prevent tight loop if fetchUpdates returns immediately
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        };

        // Start the loop without blocking
        pollLoop();
    }

    stopPolling() {
        this.isPolling = false;
        console.log('[TelegramService] Stopped polling.');
    }

    async fetchUpdates() {
        if (this.isFetching) return;

        const botToken = configService.get('TELEGRAM_BOT_TOKEN');
        if (!botToken) {
            console.warn('[Telegram] Skipping update poll: No TELEGRAM_BOT_TOKEN configured.');
            return;
        }

        console.log(`[Telegram] Fetching updates (Token: ${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 4)})`);
        this.isFetching = true;
        try {
            const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
            const response = await axios.get(url, {
                params: {
                    offset: this.lastUpdateId + 1,
                    timeout: 20 // Long polling (seconds)
                },
                timeout: 30000 // 30s network timeout
            });

            if (response.data.ok) {
                const updates = response.data.result;
                console.log(`[Telegram] API returned ${updates.length} updates.`);
                if (updates.length > 0) {
                    for (const update of updates) {
                        await this.processUpdate(update);
                        this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
                    }
                }
            }
        } catch (error) {
            const status = error.response ? error.response.status : null;
            console.error(`[TelegramService] Fetch updates failed: ${error.message}${status ? ` (Status: ${status})` : ''}`);

            // If conflict (409), wait longer before retrying to let other processes settle
            const retryDelay = status === 409 ? 10000 : 5000;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        } finally {
            this.isFetching = false;
        }
    }

    async processUpdate(update) {
        console.log(`[Telegram] Raw Update:`, JSON.stringify(update));
        let chat = null;

        // Message
        if (update.message && update.message.chat) {
            chat = update.message.chat;
        }
        // Channel post
        else if (update.channel_post && update.channel_post.chat) {
            chat = update.channel_post.chat;
        }
        // Member joined group/bot added to group
        else if (update.my_chat_member && update.my_chat_member.chat) {
            // Check if bot was added or kicked
            const newStatus = update.my_chat_member.new_chat_member.status;
            if (['member', 'administrator'].includes(newStatus)) {
                chat = update.my_chat_member.chat;
            } else {
                console.log(`[Telegram] Bot removed/left from chat ${update.my_chat_member.chat.title}. Removing from DB...`);
                try {
                    await supabase.from('telegram_chats').delete().eq('chat_id', update.my_chat_member.chat.id.toString());
                } catch (delErr) {
                    console.error('[TelegramService] Failed to delete kicked chat:', delErr.message);
                }
                return;
            }
        }
        else {
            // Not a supported type
            return;
        }

        if (!chat) return;

        const chatId = chat.id.toString();
        const type = chat.type; // 'private', 'group', 'supergroup', 'channel'
        const title = chat.title || chat.first_name + (chat.last_name ? ' ' + chat.last_name : '') || 'Unknown User';
        const username = chat.username || null;

        try {
            // Upsert into our tracking table
            const { error } = await supabase
                .from('telegram_chats')
                .upsert({
                    chat_id: chatId,
                    type: type,
                    title: title,
                    username: username,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'chat_id' });

            if (error) {
                console.error(`[TelegramService] Error saving chat ${title} (${chatId}):`, error.message);
            } else {
                console.log(`[TelegramService] Successfully saved/updated chat: ${title} (${type}) - ID: ${chatId}`);
            }

            // Auto-reply logic
            const botToken = configService.get('TELEGRAM_BOT_TOKEN');
            if (botToken) {
                // 1. Private chat /start
                if (type === 'private' && update.message && update.message.text && update.message.text.startsWith('/start')) {
                    try {
                        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            chat_id: chatId,
                            text: "Welcome! Let's start."
                        });
                        console.log(`[TelegramService] Sent welcome message to private user: ${title}`);
                    } catch (replyErr) {
                        console.error(`[TelegramService] Failed to send private welcome:`, replyErr.message);
                    }
                }
                // 2. Bot added to group (only if not already handled by a message event in this loop)
                else if (update.my_chat_member && update.my_chat_member.new_chat_member.status === 'member' && type !== 'private') {
                    try {
                        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            chat_id: chatId,
                            text: "Welcome! Let's start."
                        });
                        console.log(`[TelegramService] Sent welcome message to group: ${title}`);
                    } catch (replyErr) {
                        console.error(`[TelegramService] Failed to send group welcome:`, replyErr.message);
                    }
                }
            }
        } catch (err) {
            console.error(`[TelegramService] Exception saving chat ${title}:`, err.message);
        }
    }

    async getSavedChats() {
        try {
            console.log('[TelegramService] Fetching saved chats from database (excluding private)...');
            // Filter out 'private' to only show Groups/Channels in the React UI
            const { data, error } = await supabase
                .from('telegram_chats')
                .select('*')
                .neq('type', 'private')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            console.log(`[TelegramService] Found ${data ? data.length : 0} groups/channels in DB.`);
            return data || [];
        } catch (err) {
            console.error('[TelegramService] Error getting saved chats:', err.message);
            return [];
        }
    }

    async getAllPrivateChatIds() {
        try {
            const { data, error } = await supabase
                .from('telegram_chats')
                .select('chat_id')
                .eq('type', 'private');

            if (error) throw error;

            return (data || []).map(row => row.chat_id);
        } catch (err) {
            console.error('[TelegramService] Error getting private chat IDs:', err.message);
            return [];
        }
    }
}

// Export a singleton instance
const telegramService = new TelegramService();
module.exports = telegramService;
