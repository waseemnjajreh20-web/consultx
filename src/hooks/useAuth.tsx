import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isRecoveryMode: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    // Auto-trial must be invoked here, not in Auth.tsx, because AuthProvider is
    // mounted outside BrowserRouter (see App.tsx) and is never unmounted on route
    // changes. When Google OAuth finishes, the browser lands on "/" (Index), NOT
    // Auth.tsx, so its useEffect handlers cannot fire. onAuthStateChange is the
    // only listener guaranteed to run regardless of the active page.
    //
    // SIGNED_IN fires on actual sign-in (email/password, OAuth, magic link), NOT
    // on getSession() page reloads (that event is INITIAL_SESSION), so this won't
    // call auto-trial on every refresh for already-signed-in users. Both edge
    // functions are idempotent — they return "already_exists" in one DB query if
    // a row already exists, making them safe for all auth methods.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === "PASSWORD_RECOVERY") {
          setIsRecoveryMode(true);
        }

        if (event === "SIGNED_IN" && session?.access_token) {
          supabase.functions.invoke("auto-trial", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
          supabase.functions.invoke("corporate-trial", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsRecoveryMode(false);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=recovery`,
    });
    return { error: error as Error | null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setIsRecoveryMode(false);
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isRecoveryMode, signUp, signIn, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
