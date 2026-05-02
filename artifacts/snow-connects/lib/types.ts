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

export interface InstructorProfile {
  user_id: string;
  bio: string;
  photo: string;
  certifications: string[];
  experience_years: number;
  base_price: number;
  rating: number;
  resort_ids: string[];
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

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "first_time", label: "İlk defa" },
  { value: "0_8", label: "0–8 saat" },
  { value: "9_20", label: "9–20 saat" },
  { value: "21_50", label: "21–50 saat" },
  { value: "51_plus", label: "51+ saat" },
];
