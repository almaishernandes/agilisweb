import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env file manually
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        env[key] = value;
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_SERVICE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Key defined:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) {
            console.error('Error fetching profiles:', error);
        } else {
            console.log('Profiles data successfully loaded. Total rows:', data.length);
            console.log('Rows:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Exception caught:', err);
    }
}

run();
