require('dotenv').config();
const { Pool } = require('pg');

async function createBucket() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // Check existing buckets
        const check = await pool.query("SELECT id, name, public FROM storage.buckets;");
        console.log('Existing buckets:', check.rows);

        if (!check.rows.find(b => b.id === 'posts' || b.name === 'posts')) {
            // Create the posts bucket
            await pool.query(`
                INSERT INTO storage.buckets (id, name, public) 
                VALUES ('posts', 'posts', true)
                ON CONFLICT (id) DO UPDATE SET public = true;
            `);
            console.log('posts bucket created!');
        } else {
            // Make sure it is public
            await pool.query("UPDATE storage.buckets SET public = true WHERE id = 'posts';");
            console.log('posts bucket already exists - made public');
        }

        const verify = await pool.query("SELECT id, name, public FROM storage.buckets WHERE id = 'posts';");
        console.log('Verified:', verify.rows);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

createBucket();
