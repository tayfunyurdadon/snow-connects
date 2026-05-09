export type UserRole = "customer" | "instructor" | "admin" | "school_admin";

export interface SkiSchool {
  id: string;
  name: string;
  slug: string | null;
  logo: string;
  description: string;
  iban: string;
  iban_holder_name: string;
  admin_user_id: string | null;
  status: "active" | "blocked";
  instructor_share_rate: number;
  price_1_kurus: number;
  price_2_kurus: number;
  price_3_kurus: number;
  price_4plus_kurus: number;
  created_at: string;
}

export interface SchoolPayoutsSummary {
  instructorShareRate: number;
  pendingKurus: number;
  releasedKurus: number;
  pendingCount: number;
  releasedCount: number;
  pendingInstructorKurus: number;
  pendingSchoolKurus: number;
  releasedInstructorKurus: number;
  releasedSchoolKurus: number;
  // Source split (online from app vs manual walk-in). Optional for
  // backwards compatibility with stale clients hitting an old RPC.
  pendingOnlineKurus?: number;
  pendingManualKurus?: number;
  releasedOnlineKurus?: number;
  releasedManualKurus?: number;
  totalOnlineKurus?: number;
  totalManualKurus?: number;
  onlineCount?: number;
  manualCount?: number;
}

export interface SchoolInstructorBreakdownRow {
  instructor_id: string;
  instructor_name: string;
  lesson_count: number;
  pending_kurus: number;
  released_kurus: number;
  total_kurus: number;
  instructor_share_kurus: number;
  school_share_kurus: number;
}

export type SchoolApprovalStatus = "pending" | "approved" | "rejected";
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
  review_count: number;
  resort_ids: string[];
  verification_status: VerificationStatus;
  school_id?: string | null;
  school_approval_status?: SchoolApprovalStatus;
}

export type DisputeReason =
  | "lesson_not_held"
  | "instructor_no_show"
  | "instructor_late"
  | "safety_concern"
  | "other";

export const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: "lesson_not_held", label: "Ders gerçekleşmedi" },
  { value: "instructor_no_show", label: "Eğitmen gelmedi" },
  { value: "instructor_late", label: "Eğitmen çok geç kaldı" },
  { value: "safety_concern", label: "Güvenlik sorunu" },
  { value: "other", label: "Diğer" },
];

export interface Dispute {
  id: string;
  booking_id: string;
  customer_id: string;
  instructor_id: string;
  reason: DisputeReason;
  description: string;
  status: "pending" | "approved" | "rejected";
  refund_amount: number | null;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface LessonReview {
  id: string;
  booking_id: string;
  customer_id: string;
  instructor_id: string;
  rating: number;
  comment: string;
  created_at: string;
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
  customer_id: string | null;
  instructor_id: string;
  source?: "online" | "manual";
  manual_customer_name?: string | null;
  manual_customer_phone?: string | null;
  manual_notes?: string | null;
  resort_id: string;
  slot_ids: string[];
  student_count: number;
  base_amount: number;
  vat_amount: number;
  /**
   * Total Snow Connects revenue per booking, in kuruş.
   * = bank_commission + transaction_fee.
   */
  commission_amount: number;
  /** Flat transaction fee charged on top of the lesson, in kuruş. */
  transaction_fee: number;
  /** Bank commission deducted from the instructor, in kuruş. */
  bank_commission: number;
  /** Total the customer paid, in kuruş. = base + vat + transaction_fee. */
  total_price: number;
  payment_status: "pending" | "paid" | "failed" | "refunded";
  lesson_status: "upcoming" | "in_progress" | "completed" | "cancelled";
  lesson_started_at: string | null;
  lesson_ended_at: string | null;
  lesson_date: string;
  created_at: string;
  is_test_booking: boolean;
  // Set by create_booking for non-test pending bookings (now() + 15 min).
  // Null for paid bookings or test-mode auto-paid rows. When the
  // deadline passes, release_expired_pending_bookings() frees the
  // slots and marks payment_status = 'failed'.
  payment_deadline: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  refund_amount: number | null;
  refund_pct: number | null;
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
  status: "pending" | "released" | "cancelled";
  recipient_type: "instructor" | "school";
  recipient_id: string;
}

// Per-instructor / per-slot row returned by school_day_calendar() RPC.
export interface SchoolCalendarSlot {
  slot_time: string;
  status: "available" | "booked" | "manual";
  booking_id: string | null;
  source: "online" | "manual" | null;
  payment_status: "pending" | "paid" | "failed" | "refunded" | null;
  lesson_status: "upcoming" | "completed" | "cancelled" | null;
  customer_name: string | null;
  customer_phone: string | null;
  student_count: number | null;
  students:
    | {
        first_name: string;
        last_name: string;
        age: number;
        experience_level: string;
      }[]
    | null;
  notes: string | null;
  total_price: number | null;
  is_first_slot: boolean;
}

export interface SchoolCalendarInstructor {
  instructor_id: string;
  instructor_name: string;
  slots: SchoolCalendarSlot[];
}

export interface SchoolCalendarDay {
  date: string;
  instructors: SchoolCalendarInstructor[];
}

// Admin dashboard summary returned by admin_stats() RPC.
export interface AdminStats {
  totalUsers: number;
  totalCustomers: number;
  totalInstructors: number;
  pendingVerifications: number;
  totalBookings: number;
  paidBookings: number;
  /** Snow Connects platform revenue (bank commission + transaction fees). */
  revenueKurus: number;
  /** Total amount customers paid (gross volume). */
  customerPaidKurus?: number;
  /** Sum of bank commissions across paid bookings. */
  bankCommissionKurus?: number;
  /** Sum of flat transaction fees collected. */
  transactionFeesKurus?: number;
  pendingPayoutsKurus: number;
  flaggedMessages: number;
  totalResorts: number;
}

// app_config row, with admin-editable platform settings.
export interface AppConfig {
  id: number;
  vat_rate: number;
  /** Legacy field kept for backward compatibility. Not used in pricing. */
  commission_rate: number;
  /** Bank commission rate applied to lesson amount (e.g. 0.04 = 4%). */
  bank_commission_rate?: number;
  /** Flat transaction fee added on top of the lesson, in kuruş. */
  transaction_fee_kurus?: number;
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
