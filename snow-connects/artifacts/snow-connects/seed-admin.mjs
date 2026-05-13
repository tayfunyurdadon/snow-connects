import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });
const email = "admin@snowconnects.com";
const password = "admin123";
const { data: list, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) throw listErr;
const existing = list.users.find((u) => u.email?.toLowerCase() === email);
let userId;
if (existing) {
  userId = existing.id;
  await supa.auth.admin.updateUserById(userId, { password, email_confirm: true });
  console.log("admin already exists, password reset:", userId);
} else {
  const { data, error } = await supa.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: "Snow Connects Admin", role: "admin" },
  });
  if (error) throw error;
  userId = data.user.id;
  console.log("created admin auth user:", userId);
}
const { error: upErr } = await supa.from("users").upsert({
  id: userId, email, name: "Snow Connects Admin", role: "admin", status: "active",
}, { onConflict: "id" });
if (upErr) throw upErr;
const { data: row } = await supa.from("users").select("*").eq("id", userId).maybeSingle();
console.log("public.users row:", JSON.stringify(row, null, 2));
