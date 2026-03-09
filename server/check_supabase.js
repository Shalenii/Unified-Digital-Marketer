require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('--- Supabase Storage Check ---');
    try {
        const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
        if (bucketError) throw bucketError;

        console.log('Available Buckets:', buckets.map(b => b.id).join(', '));

        for (const bucket of buckets) {
            console.log(`\nBucket: ${bucket.id} (Public: ${bucket.public})`);
            const { data: files, error: fileError } = await supabase.storage.from(bucket.id).list('', { limit: 5 });
            if (fileError) {
                console.log(`  Error listing files: ${fileError.message}`);
                continue;
            }
            if (files && files.length > 0) {
                console.log('  Sample Files:');
                files.forEach(f => {
                    const { data: { publicUrl } } = supabase.storage.from(bucket.id).getPublicUrl(f.name);
                    console.log(`    - ${f.name} => ${publicUrl}`);
                });
            } else {
                console.log('  No files found.');
            }
        }
    } catch (err) {
        console.error('CRITICAL ERROR:', err.message);
    }
}

checkSupabase();
