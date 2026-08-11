import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
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
        await getStorageMode();
        const token = getMongoToken();
        if (!token) {
          setSession(null);
          setUser(null);
          setDbUser(null);
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
    return () => clearTimeout(safetyTimer);
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
