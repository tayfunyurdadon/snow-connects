import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

const PASSWORD = "123456";

const customers = [
  { email: "c@snow.com", name: "Test Müşteri" },
  { email: "c1@snow.com", name: "Test Müşteri 1" },
  { email: "c2@snow.com", name: "Test Müşteri 2" },
];

const instructors = [
  { email: "i@snow.com", name: "Test Eğitmen", bio: "10 yıl ISIA Level 2 eğitmen.", years: 10, p1: 150000, p2: 120000, p3: 100000, p4: 80000 },
  { email: "i1@snow.com", name: "Test Eğitmen 1", bio: "Snowboard ve kayak eğitmeni.", years: 6, p1: 130000, p2: 110000, p3: 95000, p4: 75000 },
  { email: "i2@snow.com", name: "Test Eğitmen 2", bio: "Çocuk eğitmeni, sertifikalı.", years: 4, p1: 110000, p2: 95000, p3: 85000, p4: 70000 },
  { email: "i3@snow.com", name: "Test Eğitmen 3", bio: "İleri seviye kayak eğitmeni.", years: 12, p1: 180000, p2: 150000, p3: 130000, p4: 100000 },
  { email: "i4@snow.com", name: "Test Eğitmen 4", bio: "Yeni başlayanlar için ideal.", years: 3, p1: 100000, p2: 90000, p3: 80000, p4: 65000 },
];

// fetch resort ids to attach instructors to all of them
const { data: resorts, error: rErr } = await supa.from("resorts").select("id");
if (rErr) throw rErr;
const resortIds = resorts.map((r) => r.id);
console.log("resort count:", resortIds.length);

// existing users
const { data: list, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) throw listErr;
const byEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

async function ensureAuth(email, name, role) {
  const lower = email.toLowerCase();
  const existing = byEmail.get(lower);
  if (existing) {
    await supa.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
    return existing.id;
  }
  const { data, error } = await supa.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { name, role },
  });
  if (error) throw error;
  return data.user.id;
}

async function ensurePublicUser(id, email, name, role) {
  const { error } = await supa.from("users").upsert(
    { id, email, name, role, status: "active" },
    { onConflict: "id" },
  );
  if (error) throw error;
}

for (const c of customers) {
  const id = await ensureAuth(c.email, c.name, "customer");
  await ensurePublicUser(id, c.email, c.name, "customer");
  console.log("customer:", c.email, id);
}

for (const i of instructors) {
  const id = await ensureAuth(i.email, i.name, "instructor");
  await ensurePublicUser(id, i.email, i.name, "instructor");
  const { error } = await supa.from("instructor_profiles").upsert(
    {
      user_id: id,
      bio: i.bio,
      photo: "",
      certifications: ["ISIA Level 2"],
      experience_years: i.years,
      base_price: i.p1, // legacy
      price_1_person: i.p1,
      price_2_person: i.p2,
      price_3_person: i.p3,
      price_4_plus_person: i.p4,
      resort_ids: resortIds,
      verification_status: "approved",
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  console.log("instructor:", i.email, id);
}

console.log("done");
