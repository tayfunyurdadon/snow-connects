import { Redirect } from "expo-router";
import React from "react";

export default function Index() {
  // Guest browsing: always land on the resort tab. Auth is enforced
  // per-action (booking, payment, messages, etc.).
  return <Redirect href="/(app)/(tabs)" />;
}
