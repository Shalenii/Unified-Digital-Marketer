require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
(async () => {
    const { data: posts, error } = await supabase
        .from('posts')
        .select('id, status, platforms, internal_notes, created_at')
        .like('platforms', '%"Instagram"%') // get only instagram posts
        .order('created_at', { ascending: false })
        .limit(20);
    fs.writeFileSync('out.json', JSON.stringify(posts, null, 2));
    console.log('done');
})();
