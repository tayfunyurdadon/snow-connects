import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

const PASSWORD = "123456";
const SCHOOL_NAME = "Snow Academy";
const SCHOOL_ADMIN_EMAIL = "s@snow.com";
const SCHOOL_ADMIN_NAME = "Snow Academy Yönetici";
// Instructor emails to attach to the school
const SCHOOL_INSTRUCTORS = ["i2@snow.com", "i3@snow.com", "i4@snow.com"];

// 1. Ensure school admin auth user
const { data: list, error: listErr } = await supa.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listErr) throw listErr;
const byEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

let adminId;
const existing = byEmail.get(SCHOOL_ADMIN_EMAIL.toLowerCase());
if (existing) {
  await supa.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    email_confirm: true,
  });
  adminId = existing.id;
} else {
  const { data, error } = await supa.auth.admin.createUser({
    email: SCHOOL_ADMIN_EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: SCHOOL_ADMIN_NAME, role: "customer" },
  });
  if (error) throw error;
  adminId = data.user.id;
}
// Make sure the public users row exists (handle_new_user normally creates it)
await supa.from("users").upsert(
  {
    id: adminId,
    email: SCHOOL_ADMIN_EMAIL,
    name: SCHOOL_ADMIN_NAME,
    role: "school_admin",
    status: "active",
  },
  { onConflict: "id" },
);
console.log("school admin:", SCHOOL_ADMIN_EMAIL, adminId);

// 2. Ensure school
const { data: existingSchool } = await supa
  .from("ski_schools")
  .select("id")
  .eq("name", SCHOOL_NAME)
  .maybeSingle();

let schoolId;
if (existingSchool) {
  schoolId = existingSchool.id;
  await supa
    .from("ski_schools")
    .update({
      admin_user_id: adminId,
      iban: "TR00 0000 0000 0000 0000 0000 00",
      iban_holder_name: "Snow Academy Ltd. Şti.",
      description:
        "Türkiye'nin önde gelen kayak okulu. Profesyonel eğitmen kadrosu.",
      status: "active",
    })
    .eq("id", schoolId);
} else {
  const { data, error } = await supa
    .from("ski_schools")
    .insert({
      name: SCHOOL_NAME,
      slug: "snow-academy",
      admin_user_id: adminId,
      iban: "TR00 0000 0000 0000 0000 0000 00",
      iban_holder_name: "Snow Academy Ltd. Şti.",
      description:
        "Türkiye'nin önde gelen kayak okulu. Profesyonel eğitmen kadrosu.",
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  schoolId = data.id;
}
console.log("school:", SCHOOL_NAME, schoolId);

// 3. Ensure school admin role is school_admin (also belt-and-suspenders)
await supa.from("users").update({ role: "school_admin" }).eq("id", adminId);

// 4. Attach instructors to the school (and mark as approved by school)
for (const email of SCHOOL_INSTRUCTORS) {
  const u = byEmail.get(email.toLowerCase());
  if (!u) {
    console.warn("instructor not found:", email);
    continue;
  }
  const { error } = await supa
    .from("instructor_profiles")
    .update({
      school_id: schoolId,
      school_approval_status: "approved",
      verification_status: "approved",
    })
    .eq("user_id", u.id);
  if (error) {
    console.error("attach failed:", email, error.message);
    continue;
  }
  console.log("attached:", email, "→", SCHOOL_NAME);
}

console.log("done");
