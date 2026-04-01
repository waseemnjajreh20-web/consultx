import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Ensure auto-trial runs on every fresh sign-in, including Google OAuth.
        //
        // Why here and not in Auth.tsx:
        //   AuthProvider is mounted outside BrowserRouter (see App.tsx) and is
        //   never unmounted on route changes. When Google OAuth completes, the
        //   browser is redirected to window.location.origin ("/"), which renders
        //   Index — NOT Auth.tsx. Auth.tsx is not in the DOM, so its useEffect
        //   handlers cannot fire. AuthProvider's onAuthStateChange is the only
        //   listener that is guaranteed to run regardless of which page is active.
        //
        // SIGNED_IN fires on actual sign-in events (email/password, OAuth, magic
        // link). It does NOT fire on getSession() session-restore page reloads
        // (that event is INITIAL_SESSION), so this will not call auto-trial on
        // every page refresh for already-signed-in users.
        //
        // auto-trial is idempotent: it returns {result:"already_exists"} in one
        // DB query if a user_subscriptions row already exists. Safe for every
        // auth method and returning users.
        if (event === "SIGNED_IN" && session?.access_token) {
          supabase.functions.invoke("auto-trial", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {}); // Fire-and-forget — never block auth state update
        }
      }
    );

    // THEN check for existing session
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
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
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
