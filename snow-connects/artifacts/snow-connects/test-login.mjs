import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
console.log("URL:", url, "anon key prefix:", anon?.slice(0, 12));
const supa = createClient(url, anon, { auth: { persistSession: false } });

console.log("\n--- step 1: signInWithPassword ---");
const { data: signIn, error: signErr } = await supa.auth.signInWithPassword({
  email: "admin@snowconnects.com",
  password: "admin123",
});
if (signErr) {
  console.log("signIn ERROR:", signErr.status, signErr.message, JSON.stringify(signErr));
  process.exit(1);
}
console.log("signIn user id:", signIn.user.id);
console.log("signIn user email:", signIn.user.email);
console.log("signIn user metadata:", JSON.stringify(signIn.user.user_metadata));
console.log("session access_token prefix:", signIn.session.access_token.slice(0, 24));

console.log("\n--- step 2: select * from users where id = uid (this is what the app does) ---");
const { data: row, error: rowErr, status } = await supa
  .from("users")
  .select("*")
  .eq("id", signIn.user.id)
  .maybeSingle();
console.log("status:", status);
if (rowErr) console.log("rowErr:", rowErr.code, rowErr.message, rowErr.details, rowErr.hint);
console.log("row:", JSON.stringify(row, null, 2));

console.log("\n--- step 3: select role only (in case * triggers something) ---");
const { data: r2, error: r2Err } = await supa.from("users").select("id,role,status").eq("id", signIn.user.id);
if (r2Err) console.log("r2Err:", r2Err);
console.log("rows count:", r2?.length, "data:", JSON.stringify(r2));

console.log("\n--- step 4: list policies via service key for context ---");
