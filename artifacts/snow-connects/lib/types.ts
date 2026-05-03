export type UserRole = "customer" | "instructor" | "admin";
export type UserStatus = "active" | "blocked" | "pending";

export interface AppUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  strike_count: number;
  created_at: string;
}

export interface Resort {
  id: string;
  name: string;
  region: string;
}

export type VerificationStatus =
  | "pending_documents"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export interface InstructorProfile {
  user_id: string;
  bio: string;
  photo: string;
  certifications: string[];
  experience_years: number;
  // Legacy flat per-slot rate. Kept for backward compatibility with
  // profiles created before tiered pricing. New code reads the four
  // per-person tier columns below; this is used as a fallback.
  base_price: number;
  // Per-person, per 50-minute slot pricing in kuruş, by group size.
  price_1_person: number;
  price_2_person: number;
  price_3_person: number;
  price_4_plus_person: number;
  rating: number;
  resort_ids: string[];
  verification_status: VerificationStatus;
}

export type CertificateType =
  | "ISIA Level 1"
  | "ISIA Level 2"
  | "ISIA Level 3"
  | "TKF Kayak Öğretmeni"
  | "Diğer";

export const CERTIFICATE_TYPES: CertificateType[] = [
  "ISIA Level 1",
  "ISIA Level 2",
  "ISIA Level 3",
  "TKF Kayak Öğretmeni",
  "Diğer",
];

export interface InstructorVerification {
  user_id: string;
  cert_type: CertificateType | null;
  cert_number: string | null;
  cert_issued_at: string | null;
  cert_expires_at: string | null;
  cert_doc_path: string | null;
  id_front_path: string | null;
  id_back_path: string | null;
  tc_kimlik_no: string | null;
  iban: string | null;
  iban_holder_name: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
}

// Row shape returned by the admin_list_verifications RPC.
export interface VerificationListRow {
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  resort_ids: string[] | null;
  verification_status: VerificationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  cert_type: CertificateType | null;
  cert_doc_path: string | null;
  id_front_path: string | null;
  id_back_path: string | null;
  photo: string | null;
}

export interface InstructorWithUser extends InstructorProfile {
  user: Pick<AppUser, "id" | "name">;
}

export type SlotStatus = "available" | "booked" | "manual";

export interface TimeSlot {
  id: string;
  instructor_id: string;
  date: string;
  slot_time: string;
  status: SlotStatus;
  booking_id: string | null;
  note: string | null;
}

export type ExperienceLevel =
  | "first_time"
  | "0_8"
  | "9_20"
  | "21_50"
  | "51_plus";

export interface StudentInput {
  firstName: string;
  lastName: string;
  age: number;
  experienceLevel: ExperienceLevel;
}

export interface Booking {
  id: string;
  customer_id: string;
  instructor_id: string;
  resort_id: string;
  slot_ids: string[];
  student_count: number;
  base_amount: number;
  vat_amount: number;
  commission_amount: number;
  total_price: number;
  payment_status: "pending" | "paid" | "failed" | "refunded";
  lesson_status: "upcoming" | "completed" | "cancelled";
  lesson_date: string;
  created_at: string;
  is_test_booking: boolean;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  instructor_id: string;
  booking_id: string;
  gross_amount: number;
  commission: number;
  net_amount: number;
  lesson_date: string;
  release_date: string;
  status: "pending" | "released";
}

// Admin dashboard summary returned by admin_stats() RPC.
export interface AdminStats {
  totalUsers: number;
  totalCustomers: number;
  totalInstructors: number;
  pendingVerifications: number;
  totalBookings: number;
  paidBookings: number;
  revenueKurus: number;
  pendingPayoutsKurus: number;
  flaggedMessages: number;
  totalResorts: number;
}

// app_config row, with admin-editable platform settings.
export interface AppConfig {
  id: number;
  vat_rate: number;
  commission_rate: number;
  season_start_month: number;
  season_start_day: number;
  season_end_month: number;
  season_end_day: number;
  test_mode: boolean;
}

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "first_time", label: "İlk defa" },
  { value: "0_8", label: "0–8 saat" },
  { value: "9_20", label: "9–20 saat" },
  { value: "21_50", label: "21–50 saat" },
  { value: "51_plus", label: "51+ saat" },
];
