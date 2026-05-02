import { Redirect } from "expo-router";
import React from "react";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { loading, session } = useAuth();
  if (loading) return <Loading />;
  return <Redirect href={session ? "/(app)/(tabs)" : "/(auth)/login"} />;
}
