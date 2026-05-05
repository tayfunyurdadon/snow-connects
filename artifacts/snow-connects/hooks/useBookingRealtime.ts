import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { cancelLessonReminders } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import type { Booking } from "@/lib/types";

// Subscribes to the signed-in user's bookings and surfaces the
// transitions they care about as toasts. Also invalidates the
// bookings cache so any open list/detail screen refreshes itself.
//
// Customer-facing transitions:
//   * lesson_status: upcoming → in_progress   "Eğitmenin dersi başlattı."
//   * lesson_status: in_progress → completed  "Dersin tamamlandı."
//   * lesson_status: any → cancelled          "Eğitmenin rezervasyonunu iptal etti."
//   * payment_status: pending → failed (deadline) "Ödeme süresi doldu, slot serbest bırakıldı."
//
// Instructor-facing transitions:
//   * payment_status: pending → paid          "Yeni rezervasyon: ödeme alındı."
//   * lesson_status: any → cancelled by customer "Müşteri rezervasyonu iptal etti."
//
// Cancellations triggered by the same user are suppressed (we don't
// want to toast someone for an action they just performed).
export function useBookingRealtime() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  // Toast/qc are read inside the channel callback via refs so we
  // don't have to tear down + resubscribe whenever they re-render.
  const toastRef = useRef(toast);
  const qcRef = useRef(qc);
  useEffect(() => {
    toastRef.current = toast;
    qcRef.current = qc;
  }, [toast, qc]);

  useEffect(() => {
    if (!user) return;
    const filterCol =
      user.role === "instructor" ? "instructor_id" : "customer_id";
    // Unique channel name per mount. Supabase JS caches channels by
    // name internally; on React Strict-Mode double mount or fast
    // refresh the second `channel(name)` call returns the *already
    // subscribed* instance, and `.on(...)` after `.subscribe()`
    // throws "cannot add postgres_changes callbacks ... after
    // subscribe()". A fresh suffix avoids the collision.
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`bookings-${user.id}-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `${filterCol}=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as Booking;
          const prev = payload.old as Partial<Booking>;
          const role = user.role;
          const ls = next.lesson_status;
          const ps = next.payment_status;
          const lsChanged = prev.lesson_status !== ls;
          const psChanged = prev.payment_status !== ps;
          // Suppress self-triggered toasts (e.g. customer cancelled
          // their own booking shouldn't see "instructor cancelled").
          const cancelledBySelf =
            lsChanged && ls === "cancelled" && next.cancelled_by === user.id;

          if (role === "customer") {
            if (lsChanged && ls === "in_progress") {
              toastRef.current.show(
                "Eğitmenin dersi başlattı.",
                "default",
              );
            } else if (lsChanged && ls === "completed") {
              toastRef.current.show("Dersin tamamlandı 🎿", "success");
              // Lesson finished — drop any pending reminders.
              void cancelLessonReminders(next.id);
            } else if (lsChanged && ls === "cancelled" && !cancelledBySelf) {
              toastRef.current.show(
                "Eğitmenin rezervasyonu iptal etti.",
                "danger",
              );
              void cancelLessonReminders(next.id);
            } else if (psChanged && ps === "failed") {
              toastRef.current.show(
                "Ödeme süresi doldu, slot serbest bırakıldı.",
                "danger",
              );
              void cancelLessonReminders(next.id);
            }
          } else if (role === "instructor") {
            if (psChanged && ps === "paid") {
              toastRef.current.show(
                "Yeni rezervasyon: ödeme alındı.",
                "success",
              );
            } else if (lsChanged && ls === "cancelled" && !cancelledBySelf) {
              toastRef.current.show(
                "Müşteri rezervasyonu iptal etti.",
                "danger",
              );
            }
          }

          // Always refresh open booking views.
          qcRef.current.invalidateQueries({ queryKey: ["bookings"] });
          qcRef.current.invalidateQueries({
            queryKey: ["booking-detail", next.id],
          });
          qcRef.current.invalidateQueries({ queryKey: ["my-day-bookings"] });
          qcRef.current.invalidateQueries({ queryKey: ["my-slots"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}
