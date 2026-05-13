import { Redirect } from "expo-router";
import React from "react";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  // Route signed-in role-restricted users to their own area before falling
  // through to guest browsing. Without this, web URL routing collapses all
  // (group) paths to "/" and lands everyone on the customer home.
  if (user?.role === "admin") return <Redirect href="/(admin)/(tabs)" />;
  if (user?.role === "school_admin")
    return <Redirect href="/(school)/(tabs)" />;
  // Guest browsing + customers + instructors land on the resort tab.
  return <Redirect href="/(app)/(tabs)" />;
}
