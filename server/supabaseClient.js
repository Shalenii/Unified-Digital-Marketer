const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('SERVER ERROR: Missing Supabase Credentials (SUPABASE_URL or SUPABASE_KEY)');
    // We don't throw here to allow the server to start even if config is missing, 
    // but DB operations will fail.
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
