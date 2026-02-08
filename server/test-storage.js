require('dotenv').config();
const supabase = require('./supabaseClient');

async function testStorage() {
    try {
        console.log('Testing Supabase Storage connnection...');
        console.log('Project URL:', process.env.SUPABASE_URL);

        // 1. List Buckets (Might fail with Anon key)
        console.log('\n[1] Scanning buckets...');
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();

        if (listError) {
            console.warn('⚠️ Could not list buckets (likely 403 Forbidden for Anon key).');
            console.log('   Skipping bucket check and trying upload directly...');
        } else {
            console.log(`[1] Found ${buckets.length} buckets.`);
            const postsBucket = buckets.find(b => b.name === 'posts');
            if (postsBucket) {
                console.log('✅ Bucket "posts" found.');
            } else {
                console.warn('⚠️ Bucket "posts" NOT found in list! Upload might fail.');
                console.log('Available buckets:', buckets.map(b => b.name).join(', '));
            }
        }

        // 2. Try Upload
        console.log('\n[2] Attempting test upload...');
        const testFileName = `test_${Date.now()}.txt`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('posts')
            .upload(testFileName, Buffer.from('Hello Supabase'), {
                contentType: 'text/plain'
            });

        if (uploadError) {
            console.error('❌ Upload failed:', uploadError);
            console.log('\nPOSSIBLE CAUSES:');
            console.log('1. Bucket "posts" does not exist. (Did you run the SQL script?)');
            console.log('2. RLS Policy blocks uploads. (Did you run the SQL script?)');
        } else {
            console.log('✅ Upload success:', uploadData.path);

            // 3. Get Public URL
            const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(testFileName);
            console.log('   Public URL:', publicUrl);
            console.log('\nVerify this URL works in your browser.');
        }

    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
}

testStorage();
