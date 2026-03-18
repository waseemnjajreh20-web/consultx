import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  mode: "standard" | "analysis";
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  created_at: string;
  image_url?: string;
  image_urls?: string[];
}

export function useConversations() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createConversation = useCallback(
    async (title: string, mode: "standard" | "analysis" = "standard"): Promise<string | null> => {
      if (!user) return null;
      setLoading(true);
      setError(null);

      try {
        const { data, error: insertError } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            title: title.slice(0, 100), // Limit title length
            mode,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        return data?.id || null;
      } catch (err: any) {
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const saveMessage = useCallback(
    async (
      conversationId: string,
      role: "user" | "assistant",
      content: string,
      sources: string[] = [],
      imageUrl?: string,
      imageUrls?: string[]
    ): Promise<string | null> => {
      if (!user) return null;
      setError(null);

      try {
        const insertData: Record<string, unknown> = {
          conversation_id: conversationId,
          role,
          content,
          sources,
        };
        if (imageUrl) {
          insertData.image_url = imageUrl;
        }
        if (imageUrls && imageUrls.length > 0) {
          insertData.image_urls = imageUrls;
        }
        const { data, error: insertError } = await supabase
          .from("messages")
          .insert(insertData as any)
          .select("id")
          .single();

        if (insertError) throw insertError;

        // Update conversation's updated_at
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        return data?.id || null;
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    },
    [user]
  );

  const updateConversationTitle = useCallback(
    async (conversationId: string, title: string): Promise<boolean> => {
      if (!user) return false;

      try {
        const { error: updateError } = await supabase
          .from("conversations")
          .update({ title: title.slice(0, 100) })
          .eq("id", conversationId);

        if (updateError) throw updateError;
        return true;
      } catch (err: any) {
        setError(err.message);
        return false;
      }
    },
    [user]
  );

  const loadConversation = useCallback(
    async (conversationId: string): Promise<{ conversation: Conversation; messages: ConversationMessage[] } | null> => {
      if (!user) return null;
      setLoading(true);
      setError(null);

      try {
        // Load conversation
        const { data: conversation, error: convError } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", conversationId)
          .maybeSingle();

        if (convError) throw convError;
        if (!conversation) return null;

        // Load messages
        const { data: messages, error: msgError } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (msgError) throw msgError;

        return {
          conversation: conversation as Conversation,
          messages: (messages || []) as ConversationMessage[],
        };
      } catch (err: any) {
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const listConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!user) return [];
    setLoading(true);
    setError(null);

    try {
      const { data, error: listError } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (listError) throw listError;
      return (data || []) as Conversation[];
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  const deleteConversation = useCallback(
    async (conversationId: string): Promise<boolean> => {
      if (!user) return false;
      setError(null);

      try {
        const { error: deleteError } = await supabase
          .from("conversations")
          .delete()
          .eq("id", conversationId);

        if (deleteError) throw deleteError;
        return true;
      } catch (err: any) {
        setError(err.message);
        return false;
      }
    },
    [user]
  );

  return {
    loading,
    error,
    createConversation,
    saveMessage,
    updateConversationTitle,
    loadConversation,
    listConversations,
    deleteConversation,
  };
}
