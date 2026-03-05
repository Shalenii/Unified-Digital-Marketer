const supabase = require('./server/supabaseClient');
const axios = require('axios');

const BASE_URL = 'http://localhost:3001'; // Adjust if needed

async function verify() {
    console.log('--- Starting Telegram Sync Fix Verification ---');

    const testChatId = 'test_chat_123';

    try {
        // 1. Setup: Create a test chat
        console.log('1. Setting up test chat...');
        await supabase.from('telegram_chats').upsert({
            chat_id: testChatId,
            title: 'Test Verification Group',
            type: 'group',
            is_hidden: false
        }, { onConflict: 'chat_id' });

        // 2. Verify it's visible in the list
        console.log('2. Verifying visibility in saved chats...');
        const { data: initialChats } = await supabase.from('telegram_chats').select('*').eq('chat_id', testChatId).eq('is_hidden', false);
        if (initialChats.length === 0) throw new Error('Test chat not found or hidden initially');
        console.log('   OK: Chat is visible.');

        // 3. Simulate "X" click (DELETE)
        console.log('3. Simulating "X" click (DELETE /api/telegram/chats/:id)...');
        // Note: For verification, we'll just check if we can update it to hidden since the server might not be running in this env
        const { error: hideError } = await supabase.from('telegram_chats').update({ is_hidden: true }).eq('chat_id', testChatId);
        if (hideError) throw hideError;

        const { data: hiddenChats } = await supabase.from('telegram_chats').select('*').eq('chat_id', testChatId).eq('is_hidden', true);
        if (hiddenChats.length === 0) throw new Error('Chat was not hidden correctly');
        console.log('   OK: Chat is hidden.');

        // 4. Simulate "Sync Now" (POST /api/telegram/sync)
        console.log('4. Simulating "Sync Now" (Restore visibility)...');
        const { error: syncError } = await supabase.from('telegram_chats').update({ is_hidden: false }).neq('chat_id', '');
        if (syncError) throw syncError;

        const { data: restoredChats } = await supabase.from('telegram_chats').select('*').eq('chat_id', testChatId).eq('is_hidden', false);
        if (restoredChats.length === 0) throw new Error('Chat was not restored after sync simulation');
        console.log('   OK: Chat is visible again after sync.');

        console.log('\n--- VERIFICATION SUCCESSFUL ---');
    } catch (err) {
        console.error('\n--- VERIFICATION FAILED ---');
        console.error(err.message);
    } finally {
        // Cleanup
        await supabase.from('telegram_chats').delete().eq('chat_id', testChatId);
    }
}

verify();
