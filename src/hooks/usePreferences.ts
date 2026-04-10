import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Preferences {
  ai_memory_level: "none" | "session" | "persistent";
  output_format: "concise" | "detailed" | "report";
  preferred_standards: string[];
}

const DEFAULT_PREFS: Preferences = {
  ai_memory_level: "session",
  output_format: "detailed",
  preferred_standards: [],
};

export function usePreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setPreferences(DEFAULT_PREFS); setLoading(false); return; }
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("ai_memory_level, output_format, preferred_standards")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPreferences({
          ai_memory_level: (data as any).ai_memory_level || "session",
          output_format: (data as any).output_format || "detailed",
          preferred_standards: (data as any).preferred_standards || [],
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const updatePreferences = useCallback(async (updates: Partial<Preferences>) => {
    if (!user) return;
    const newPrefs = { ...preferences, ...updates };
    setPreferences(newPrefs);
    await supabase.from("profiles").update(updates as any).eq("user_id", user.id);
  }, [user, preferences]);

  return { preferences, loading, updatePreferences };
}
