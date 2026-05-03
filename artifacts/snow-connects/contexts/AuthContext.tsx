import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/lib/types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: AppUser | null;
  refreshUser: () => Promise<AppUser | null>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);

  const fetchProfile = useCallback(
    async (uid: string | undefined): Promise<AppUser | null> => {
      console.log("[auth] fetchProfile start uid=", uid);
      if (!uid) {
        console.log("[auth] fetchProfile no uid, clearing user");
        setUser(null);
        return null;
      }
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (error) {
        console.warn(
          "[auth] profile fetch error code=",
          error.code,
          "msg=",
          error.message,
          "details=",
          error.details,
        );
        setUser(null);
        return null;
      }
      const profile = (data ?? null) as AppUser | null;
      console.log(
        "[auth] fetchProfile result uid=",
        uid,
        "role=",
        profile?.role,
        "status=",
        profile?.status,
        "rowFound=",
        !!profile,
      );
      setUser(profile);
      return profile;
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await fetchProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      await fetchProfile(s?.user.id);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshUser = useCallback(async (): Promise<AppUser | null> => {
    const { data } = await supabase.auth.getSession();
    return fetchProfile(data.session?.user.id);
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ loading, session, user, refreshUser, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
