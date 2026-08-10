import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { DBUser } from "@/lib/database.types";
import { clearMongoToken, deleteUser, getMongoToken, getStorageMode, getUser, mongoMe, updateUser } from "@/lib/storage";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  dbUser: DBUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DBUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDbUser = async (userId: string) => {
    const data = await getUser(userId);
    setDbUser(data ?? null);
    return data ?? null;
  };

  const refreshUser = async () => {
    if (user) await fetchDbUser(user.id);
  };

  useEffect(() => {
    // Safety valve — never stay on loading screen more than 6 s
    const safetyTimer = setTimeout(() => setLoading(false), 6000);

    const initialize = async () => {
      try {
        const storageMode = await getStorageMode();
        if (storageMode === "mongodb") {
          const token = getMongoToken();
          if (!token) {
            return;
          }
          try {
            const profile = await mongoMe(token);
            const mongoUser = profile as unknown as User;
            setSession({ access_token: token, user: mongoUser } as unknown as Session);
            setUser(mongoUser);
            setDbUser(profile);
          } catch {
            clearMongoToken();
            setSession(null);
            setUser(null);
            setDbUser(null);
          }
          clearTimeout(safetyTimer);
          setLoading(false);
          return;
        }

        if (!supabase) {
          setSession(null);
          setUser(null);
          setDbUser(null);
          clearTimeout(safetyTimer);
          setLoading(false);
          return;
        }

        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 1800)),
        ]);
        const session = sessionResult?.data.session ?? null;
        const error = sessionResult?.error;
        if (error || !session) {
          setSession(null);
          setUser(null);
          setDbUser(null);
          clearTimeout(safetyTimer);
          setLoading(false);
          return;
        }
        setSession(session);
        setUser(session.user);
        await Promise.race([
          fetchDbUser(session.user.id),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 1800)),
        ]);
      } catch {
        setSession(null);
        setUser(null);
        setDbUser(null);
      } finally {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    };
    void initialize();

    if (!supabase) return () => clearTimeout(safetyTimer);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED failure or explicit sign-out → clear everything
      if (event === "SIGNED_OUT" || !session) {
        setSession(null);
        setUser(null);
        setDbUser(null);
        return;
      }
      setSession(session);
      setUser(session.user);
      // On fresh sign-up the profile INSERT happens AFTER this event fires,
      // so fetchDbUser may return null. Retry up to 3× with back-off.
      const profile = await fetchDbUser(session.user.id);
      if (!profile && event === "SIGNED_IN") {
        for (const delay of [800, 1500, 3000]) {
          await new Promise(r => setTimeout(r, delay));
          const retry = await fetchDbUser(session.user.id);
          if (retry) break;
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Mark online/offline
  useEffect(() => {
    if (!user) return;
    // Must await — Supabase JS v2 lazy promises never fire without await/.then()
    void updateUser(user.id, { last_seen: new Date().toISOString() });

    const handleUnload = () => {
      void updateUser(user.id, { last_seen: new Date().toISOString() });
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [user]);

  const signOut = async () => {
    clearMongoToken();
    // Best-effort server invalidation — ignore errors
    try { await supabase?.auth.signOut(); } catch { /* ignore */ }
    // Force-clear local state so the UI always responds
    setSession(null);
    setUser(null);
    setDbUser(null);
  };

  const deleteAccount = async (): Promise<{ error?: string }> => {
    if (!user) return { error: "Not authenticated" };
    try {
      await deleteUser(user.id);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not delete account" };
    }

    // Sign out (Supabase Auth user deletion requires service role — sign out is sufficient for client)
    try { await supabase?.auth.signOut(); } catch { /* local state is cleared below */ }
    setSession(null);
    setUser(null);
    setDbUser(null);
    return {};
  };

  return (
    <AuthContext.Provider value={{ session, user, dbUser, loading, signOut, refreshUser, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
