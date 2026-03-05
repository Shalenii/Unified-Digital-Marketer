const supabase = require('./server/supabaseClient');

async function migrate() {
    console.log('Starting migration: Adding is_hidden column to telegram_chats...');

    // Using a raw SQL query via a custom RPC if available, or just trying to insert/update with the new column
    // Since we don't have a direct SQL execution tool, we'll try to update an existing row with the new column 
    // to see if it exists, or use a dummy insert.
    // However, the best way to handle this in Supabase without a migration tool is usually via the SQL Editor.
    // Since I can't access the SQL Editor, I'll try to use the Supabase client to 'upsert' a row with the new column.
    // If the column doesn't exist, this will fail, informing me if I need to ask the user to run SQL.

    try {
        const { data, error } = await supabase
            .from('telegram_chats')
            .select('*')
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const firstChat = data[0];
            console.log('Testing if is_hidden column exists...');
            const { error: updateError } = await supabase
                .from('telegram_chats')
                .update({ is_hidden: false })
                .eq('chat_id', firstChat.chat_id);

            if (updateError && updateError.message.includes('column "is_hidden" does not exist')) {
                console.error('Migration Required: Please run the following SQL in your Supabase SQL Editor:');
                console.log('ALTER TABLE telegram_chats ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;');
                process.exit(1);
            } else if (updateError) {
                console.error('Update error:', updateError.message);
            } else {
                console.log('Column is_hidden already exists or was successfully updated.');
            }
        } else {
            console.log('No data in telegram_chats to test. Trying a dummy upsert...');
            const { error: upsertError } = await supabase
                .from('telegram_chats')
                .upsert({ chat_id: 'test_migration', type: 'test', title: 'Test Migration', is_hidden: false });

            if (upsertError && upsertError.message.includes('column "is_hidden" does not exist')) {
                console.error('Migration Required: Please run the following SQL in your Supabase SQL Editor:');
                console.log('ALTER TABLE telegram_chats ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;');
                process.exit(1);
            } else if (upsertError) {
                console.error('Upsert error:', upsertError.message);
            } else {
                console.log('Dummy upsert successful. Column is_hidden exists.');
                // Clean up dummy
                await supabase.from('telegram_chats').delete().eq('chat_id', 'test_migration');
            }
        }
    } catch (err) {
        console.error('Migration script failed:', err.message);
    }
}

migrate();
