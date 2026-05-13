import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, service, { auth: { persistSession:false } });

const { count, error: cErr } = await admin.from('bookings').select('id', { count:'exact', head:true });
console.log('bookings count (service):', count, 'err:', cErr?.message);

const { data: rows, error: rErr } = await admin.from('bookings').select('id, customer_id, instructor_id, lesson_date, payment_status, is_test_booking').limit(5);
console.log('bookings sample:', JSON.stringify(rows, null, 2), 'err:', rErr?.message);

const anonClient = createClient(url, anon);
const { data: signIn, error: siErr } = await anonClient.auth.signInWithPassword({ email:'admin@snowconnects.com', password:'admin123' });
console.log('signin uid:', signIn?.user?.id, 'err:', siErr?.message);

const t0 = Date.now();
const { data: myB, error: mbErr } = await anonClient.from('bookings').select('*, resort:resorts(name,region)').eq('customer_id', signIn.user.id).order('lesson_date', { ascending:false });
console.log('my bookings (customer_id filter) ms=', Date.now()-t0, 'rows=', myB?.length ?? 'null', 'err code=', mbErr?.code, 'msg=', mbErr?.message, 'details=', mbErr?.details);

// Try as a real customer too
const { data: anyCust } = await admin.from('users').select('id,email').eq('role','customer').limit(1);
console.log('first customer:', anyCust);
