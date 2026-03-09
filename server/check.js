require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
(async () => {
    const { data } = await supabase.from('posts').select('*').order('id', { ascending: false }).limit(3);
    fs.writeFileSync('out.json', JSON.stringify(data, null, 2));
    console.log('done');
})();
