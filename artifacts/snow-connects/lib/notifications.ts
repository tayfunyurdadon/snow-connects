// Local lesson-reminder notifications.
//
// We schedule two reminders per booking right after payment succeeds:
//   * T-24h: "Yarın Erciyes'te dersin var (09:00)"
//   * T-1h : "1 saat sonra dersin başlıyor"
//
// All scheduling is local — no server / push token / Edge Function
// needed. Notifications fire even with the app closed and (on iOS)
// while in Do Not Disturb. The scheduled-notification IDs are
// persisted per booking so we can cancel them when the lesson is
// cancelled or completed.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "lesson-reminder-ids";

// expo-notifications has no web implementation. Calling any of its
// methods on web throws "UnavailabilityError". We short-circuit every
// public function below when running on web so the customer flow
// (booking → payment) keeps working in the Replit web preview and on
// any future web build. Mobile (iOS/Android) behaviour is unchanged.
const IS_WEB = Platform.OS === "web";

// Foreground behaviour: show banner + sound when the user is in-app.
if (!IS_WEB) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("lesson-reminders", {
    name: "Ders hatırlatmaları",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

// Asks the user once. Returns true if the app may post notifications.
// Called lazily right before we try to schedule, so users don't see a
// permission prompt the moment they open the app.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (IS_WEB) return false;
  const settings = await Notifications.getPermissionsAsync();
  if (
    settings.granted ||
    settings.ios?.status ===
      Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    await ensureAndroidChannel();
    return true;
  }
  if (!settings.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  if (req.granted) {
    await ensureAndroidChannel();
    return true;
  }
  return false;
}

// Returns the earliest slot time (e.g. "09:00") for a booking by
// looking up its slot rows. Slot times are HH:MM strings stored
// alongside the date on time_slots.slot_time.
async function earliestSlotTime(slotIds: string[]): Promise<string | null> {
  if (slotIds.length === 0) return null;
  const { data, error } = await supabase
    .from("time_slots")
    .select("slot_time")
    .in("id", slotIds)
    .order("slot_time", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0].slot_time as string;
}

function combineLessonStart(lessonDate: string, slotTime: string): Date {
  // Lessons happen in Türkiye; the device's local TZ is good enough
  // for reminders since the customer is in the same region.
  const [h, m] = slotTime.split(":").map(Number);
  const [y, mo, d] = lessonDate.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

interface StoredIds {
  [bookingId: string]: string[];
}

async function readStored(): Promise<StoredIds> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoredIds;
  } catch {
    return {};
  }
}

async function writeStored(map: StoredIds): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

interface ScheduleArgs {
  bookingId: string;
  lessonDate: string; // YYYY-MM-DD
  slotIds: string[];
  resortName: string;
  instructorName: string;
}

export async function scheduleLessonReminders(
  args: ScheduleArgs,
): Promise<void> {
  if (IS_WEB) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const slotTime = await earliestSlotTime(args.slotIds);
  if (!slotTime) return;
  const start = combineLessonStart(args.lessonDate, slotTime);

  // Cancel any pre-existing reminders for this booking before
  // scheduling fresh ones (idempotent).
  await cancelLessonReminders(args.bookingId);

  const ids: string[] = [];
  const now = Date.now();
  const t24 = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const t1 = new Date(start.getTime() - 60 * 60 * 1000);

  if (t24.getTime() > now) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Yarın dersin var ⛷️",
        body: `${args.resortName} · ${args.instructorName} · ${slotTime}`,
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: t24,
        channelId: "lesson-reminders",
      },
    });
    ids.push(id);
  }

  if (t1.getTime() > now) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "1 saat sonra dersin başlıyor",
        body: `${args.resortName} · ${args.instructorName} · ${slotTime}`,
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: t1,
        channelId: "lesson-reminders",
      },
    });
    ids.push(id);
  }

  if (ids.length === 0) return;
  const map = await readStored();
  map[args.bookingId] = ids;
  await writeStored(map);
}

export async function cancelLessonReminders(bookingId: string): Promise<void> {
  if (IS_WEB) return;
  const map = await readStored();
  const ids = map[bookingId];
  if (!ids || ids.length === 0) return;
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
  delete map[bookingId];
  await writeStored(map);
}
