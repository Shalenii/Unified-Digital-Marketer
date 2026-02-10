const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('SERVER ERROR: Missing Supabase Credentials (SUPABASE_URL or SUPABASE_KEY)');
    // We don't throw here to allow the server to start even if config is missing, 
    // but DB operations will fail.
}

// Safe initialization
let supabase;

if (!supabaseUrl || !supabaseKey) {
    console.error('SERVER ERROR: Missing Supabase Credentials (SUPABASE_URL or SUPABASE_KEY). DB operations will fail.');
    // Create a dummy object that logs errors instead of crashing
    supabase = {
        from: () => ({
            select: () => ({ error: { message: 'Supabase not configured' } }),
            insert: () => ({ error: { message: 'Supabase not configured' } }),
            update: () => ({ error: { message: 'Supabase not configured' } }),
            delete: () => ({ error: { message: 'Supabase not configured' } }),
            upload: () => ({ error: { message: 'Supabase not configured' } }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
        storage: {
            from: () => ({
                upload: () => ({ error: { message: 'Supabase not configured' } }),
                getPublicUrl: () => ({ data: { publicUrl: '' } }),
            })
        }
    };
} else {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
        console.error('SERVER ERROR: Failed to initialize Supabase client:', err.message);
        throw err;
    }
}

module.exports = supabase;
