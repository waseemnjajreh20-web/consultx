export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      community_summaries: {
        Row: {
          community_id: number
          created_at: string | null
          id: string
          level: number
          node_ids: string[] | null
          sbc_sources: string[] | null
          summary: string
          summary_ar: string | null
          topic_keywords: string[] | null
        }
        Insert: {
          community_id: number
          created_at?: string | null
          id?: string
          level: number
          node_ids?: string[] | null
          sbc_sources?: string[] | null
          summary: string
          summary_ar?: string | null
          topic_keywords?: string[] | null
        }
        Update: {
          community_id?: number
          created_at?: string | null
          id?: string
          level?: number
          node_ids?: string[] | null
          sbc_sources?: string[] | null
          summary?: string
          summary_ar?: string | null
          topic_keywords?: string[] | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          mode: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mode?: string
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mode?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_message_usage: {
        Row: {
          created_at: string | null
          id: string
          message_count: number
          updated_at: string | null
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_count?: number
          updated_at?: string | null
          usage_date?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_count?: number
          updated_at?: string | null
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      graph_edges: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          relationship_type: string
          source_id: string | null
          target_id: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          relationship_type: string
          source_id?: string | null
          target_id?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          relationship_type?: string
          source_id?: string | null
          target_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_indexing_status: {
        Row: {
          created_at: string | null
          edges_extracted: number | null
          error_message: string | null
          file_name: string
          id: string
          last_processed_chunk: number | null
          nodes_extracted: number | null
          page_range: string | null
          processed_at: string | null
          sbc_source: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          edges_extracted?: number | null
          error_message?: string | null
          file_name: string
          id?: string
          last_processed_chunk?: number | null
          nodes_extracted?: number | null
          page_range?: string | null
          processed_at?: string | null
          sbc_source: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          edges_extracted?: number | null
          error_message?: string | null
          file_name?: string
          id?: string
          last_processed_chunk?: number | null
          nodes_extracted?: number | null
          page_range?: string | null
          processed_at?: string | null
          sbc_source?: string
          status?: string | null
        }
        Relationships: []
      }
      graph_nodes: {
        Row: {
          chapter: number | null
          created_at: string | null
          description: string | null
          id: string
          keywords: string[] | null
          name: string
          page_range: string | null
          sbc_source: string
          type: string
        }
        Insert: {
          chapter?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          keywords?: string[] | null
          name: string
          page_range?: string | null
          sbc_source: string
          type: string
        }
        Update: {
          chapter?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          keywords?: string[] | null
          name?: string
          page_range?: string | null
          sbc_source?: string
          type?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          image_url: string | null
          role: string
          sources: string[] | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          role: string
          sources?: string[] | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          role?: string
          sources?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_history: {
        Row: {
          amount: number | null
          billing_cycle: string | null
          created_at: string | null
          currency: string | null
          id: string
          plan: string | null
          status: string | null
          tap_charge_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          billing_cycle?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          tap_charge_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          billing_cycle?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          tap_charge_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          payment_type: string
          status: string
          subscription_id: string | null
          tap_charge_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          payment_type?: string
          status?: string
          subscription_id?: string | null
          tap_charge_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_type?: string
          status?: string
          subscription_id?: string | null
          tap_charge_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          billing_cycle: string | null
          corporate_domain: string | null
          created_at: string
          daily_message_count: number | null
          daily_message_date: string | null
          id: string
          plan_type: string
          subscription_end: string | null
          subscription_start: string | null
          tap_charge_id: string | null
          trial_end: string | null
          trial_expired_modal_shown: boolean
          trial_start: string | null
          trial_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle?: string | null
          corporate_domain?: string | null
          created_at?: string
          daily_message_count?: number | null
          daily_message_date?: string | null
          id?: string
          plan_type?: string
          subscription_end?: string | null
          subscription_start?: string | null
          tap_charge_id?: string | null
          trial_end?: string | null
          trial_expired_modal_shown?: boolean
          trial_start?: string | null
          trial_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: string | null
          corporate_domain?: string | null
          created_at?: string
          daily_message_count?: number | null
          daily_message_date?: string | null
          id?: string
          plan_type?: string
          subscription_end?: string | null
          subscription_start?: string | null
          tap_charge_id?: string | null
          trial_end?: string | null
          trial_expired_modal_shown?: boolean
          trial_start?: string | null
          trial_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          duration_days: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          price_amount: number
          target: string
          type: string
        }
        Insert: {
          created_at?: string
          currency?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          price_amount: number
          target?: string
          type?: string
        }
        Update: {
          created_at?: string
          currency?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          price_amount?: number
          target?: string
          type?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          card_brand: string | null
          card_last_four: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          tap_card_id: string | null
          tap_customer_id: string | null
          tap_payment_agreement_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_last_four?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          tap_card_id?: string | null
          tap_customer_id?: string | null
          tap_payment_agreement_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_last_four?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          tap_card_id?: string | null
          tap_customer_id?: string | null
          tap_payment_agreement_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_daily_usage: { Args: { p_user_id: string }; Returns: number }
      increment_daily_usage: { Args: { p_user_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
