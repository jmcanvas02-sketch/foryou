/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { getSessionUserId } from "../../utils/authSessionChange";

export type AdminProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "super_admin";
  active: boolean;
};

type LoginResult = {
  success: boolean;
  message?: string;
};

type AdminAuthContextValue = {
  loading: boolean;
  isAuthenticated: boolean;
  session: Session | null;
  user: User | null;
  profile: AdminProfile | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

async function readAdminProfile(userId: string): Promise<AdminProfile> {
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("id,email,full_name,role,active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Không thể kiểm tra quyền quản trị.");
  }

  if (!data) {
    throw new Error("Tài khoản chưa được cấp quyền quản trị.");
  }

  if (!data.active) {
    throw new Error("Tài khoản quản trị đã bị khóa.");
  }

  if (data.role !== "admin" && data.role !== "super_admin") {
    throw new Error("Tài khoản không có quyền quản trị.");
  }

  return data as AdminProfile;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const sessionUserIdRef = useRef("");
  const profileUserIdRef = useRef("");

  async function applySession(nextSession: Session | null) {
    if (!nextSession) {
      sessionUserIdRef.current = "";
      profileUserIdRef.current = "";
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const nextProfile = await readAdminProfile(nextSession.user.id);
      sessionUserIdRef.current = nextSession.user.id;
      profileUserIdRef.current = nextProfile.id;
      setSession(nextSession);
      setProfile(nextProfile);
    } catch {
      await supabase.auth.signOut();
      sessionUserIdRef.current = "";
      profileUserIdRef.current = "";
      setSession(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    localStorage.removeItem("ingiday-admin-auth");

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      void applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") {
        return;
      }

      const previousUserId = sessionUserIdRef.current;
      const nextUserId = getSessionUserId(nextSession);
      const sameValidatedUser =
        Boolean(nextUserId) &&
        previousUserId === nextUserId &&
        profileUserIdRef.current === nextUserId;

      if (
        event === "TOKEN_REFRESHED" ||
        sameValidatedUser
      ) {
        sessionUserIdRef.current = nextUserId;
        setSession(nextSession);
        return;
      }

      if (event === "SIGNED_OUT" && !previousUserId) {
        return;
      }

      window.setTimeout(() => {
        if (mounted) {
          void applySession(nextSession);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      isAuthenticated: Boolean(session && profile),
      async login(email, password) {
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error || !data.session) {
          setLoading(false);
          return {
            success: false,
            message: "Email hoặc mật khẩu không đúng.",
          };
        }

        try {
          const nextProfile = await readAdminProfile(data.session.user.id);
          setSession(data.session);
          setProfile(nextProfile);
          setLoading(false);
          return { success: true };
        } catch (profileError) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          setLoading(false);

          return {
            success: false,
            message:
              profileError instanceof Error
                ? profileError.message
                : "Không thể kiểm tra quyền quản trị.",
          };
        }
      },
      async logout() {
        setLoading(true);
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setLoading(false);
      },
    }),
    [loading, profile, session],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth phải được dùng trong AdminAuthProvider.");
  }

  return context;
}
