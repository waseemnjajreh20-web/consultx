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
      admin_audit_log: {
        Row: {
          action: string
          admin_email: string
          admin_user_id: string
          created_at: string
          id: string
          payload: Json | null
          target_user_id: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_user_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          target_user_id: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          target_user_id?: string
        }
        Relationships: []
      }
      ai_report_versions: {
        Row: {
          case_id: string
          citations: Json
          confidence_note: string | null
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          document_id: string | null
          engineer_decision: string
          engineer_decision_note: string | null
          evidence_json: Json
          id: string
          model_name: string
          model_provider: string
          org_id: string
          output_language: string
          prompt_snapshot: string | null
          report_mode: string
          response_content: string
          session_id: string
          sources: Json
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          case_id: string
          citations?: Json
          confidence_note?: string | null
          created_at?: string
          created_by: string
          decided_at?: string | null
          decided_by?: string | null
          document_id?: string | null
          engineer_decision?: string
          engineer_decision_note?: string | null
          evidence_json?: Json
          id?: string
          model_name: string
          model_provider?: string
          org_id: string
          output_language?: string
          prompt_snapshot?: string | null
          report_mode: string
          response_content: string
          session_id: string
          sources?: Json
          title: string
          updated_at?: string
          version_number?: number
        }
        Update: {
          case_id?: string
          citations?: Json
          confidence_note?: string | null
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          document_id?: string | null
          engineer_decision?: string
          engineer_decision_note?: string | null
          evidence_json?: Json
          id?: string
          model_name?: string
          model_provider?: string
          org_id?: string
          output_language?: string
          prompt_snapshot?: string | null
          report_mode?: string
          response_content?: string
          session_id?: string
          sources?: Json
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_report_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_report_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "case_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_report_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_report_versions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "case_ai_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      case_ai_sessions: {
        Row: {
          case_id: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          session_mode: string
          started_at: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          session_mode: string
          started_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          session_mode?: string
          started_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_ai_sessions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_ai_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_approvals: {
        Row: {
          approver_user_id: string
          case_id: string
          created_at: string
          decision: string
          decision_note: string | null
          id: string
          org_id: string
          review_id: string
        }
        Insert: {
          approver_user_id: string
          case_id: string
          created_at?: string
          decision: string
          decision_note?: string | null
          id?: string
          org_id: string
          review_id: string
        }
        Update: {
          approver_user_id?: string
          case_id?: string
          created_at?: string
          decision?: string
          decision_note?: string | null
          id?: string
          org_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_approvals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_approvals_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "case_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string
          category: string
          created_at: string
          description: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          org_id: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string
          version_number: number
          visibility: string
        }
        Insert: {
          case_id: string
          category: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          org_id: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by: string
          version_number?: number
          visibility?: string
        }
        Update: {
          case_id?: string
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
          version_number?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          author_id: string
          body: string
          case_id: string
          created_at: string
          id: string
          org_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          body: string
          case_id: string
          created_at?: string
          id?: string
          org_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          org_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_review_ai_reports: {
        Row: {
          created_at: string
          id: string
          linked_by: string
          org_id: string
          report_version_id: string
          review_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_by: string
          org_id: string
          report_version_id: string
          review_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_by?: string
          org_id?: string
          report_version_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_review_ai_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_review_ai_reports_report_version_id_fkey"
            columns: ["report_version_id"]
            isOneToOne: false
            referencedRelation: "ai_report_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_review_ai_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "case_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      case_reviews: {
        Row: {
          accepted_at: string | null
          case_id: string
          created_at: string
          findings: Json
          id: string
          org_id: string
          recommendation: string | null
          returned_at: string | null
          reviewer_user_id: string
          revision_number: number
          status: string
          submitted_at: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          case_id: string
          created_at?: string
          findings?: Json
          id?: string
          org_id: string
          recommendation?: string | null
          returned_at?: string | null
          reviewer_user_id: string
          revision_number?: number
          status?: string
          submitted_at?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          case_id?: string
          created_at?: string
          findings?: Json
          id?: string
          org_id?: string
          recommendation?: string | null
          returned_at?: string | null
          reviewer_user_id?: string
          revision_number?: number
          status?: string
          submitted_at?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_status_history: {
        Row: {
          actor_user_id: string
          case_id: string
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          org_id: string
          to_status: string
        }
        Insert: {
          actor_user_id: string
          case_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          org_id: string
          to_status: string
        }
        Update: {
          actor_user_id?: string
          case_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          org_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_status_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enterprise_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_status_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      community_summaries: {
        Row: {
          central_theme: string | null
          community_id: number
          compliance_chain: string[] | null
          created_at: string | null
          cross_references: string[] | null
          design_impact: string | null
          id: string
          level: number
          node_ids: string[] | null
          sbc_sources: string[] | null
          summary: string
          summary_ar: string | null
          topic_keywords: string[] | null
        }
        Insert: {
          central_theme?: string | null
          community_id: number
          compliance_chain?: string[] | null
          created_at?: string | null
          cross_references?: string[] | null
          design_impact?: string | null
          id?: string
          level: number
          node_ids?: string[] | null
          sbc_sources?: string[] | null
          summary: string
          summary_ar?: string | null
          topic_keywords?: string[] | null
        }
        Update: {
          central_theme?: string | null
          community_id?: number
          compliance_chain?: string[] | null
          created_at?: string | null
          cross_references?: string[] | null
          design_impact?: string | null
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
      corpus_coverage: {
        Row: {
          chunk_count: number | null
          file_name: string
          file_size_bytes: number | null
          id: number
          last_checked: string | null
          page_end: number | null
          page_start: number | null
          sha256: string | null
          source_id: string
          status: string
        }
        Insert: {
          chunk_count?: number | null
          file_name: string
          file_size_bytes?: number | null
          id?: number
          last_checked?: string | null
          page_end?: number | null
          page_start?: number | null
          sha256?: string | null
          source_id: string
          status?: string
        }
        Update: {
          chunk_count?: number | null
          file_name?: string
          file_size_bytes?: number | null
          id?: number
          last_checked?: string | null
          page_end?: number | null
          page_start?: number | null
          sha256?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_coverage_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["source_id"]
          },
        ]
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
      document_tables: {
        Row: {
          axis_schema: Json
          caption_ar: string | null
          caption_en: string | null
          created_at: string | null
          footnotes: Json
          id: number
          last_updated: string | null
          normative: boolean
          page_end: number | null
          page_start: number | null
          rows: Json
          section_id: string
          source_id: string
          table_id: string
          table_number: string
        }
        Insert: {
          axis_schema?: Json
          caption_ar?: string | null
          caption_en?: string | null
          created_at?: string | null
          footnotes?: Json
          id?: number
          last_updated?: string | null
          normative?: boolean
          page_end?: number | null
          page_start?: number | null
          rows?: Json
          section_id: string
          source_id: string
          table_id: string
          table_number: string
        }
        Update: {
          axis_schema?: Json
          caption_ar?: string | null
          caption_en?: string | null
          created_at?: string | null
          footnotes?: Json
          id?: number
          last_updated?: string | null
          normative?: boolean
          page_end?: number | null
          page_start?: number | null
          rows?: Json
          section_id?: string
          source_id?: string
          table_id?: string
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tables_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["source_id"]
          },
        ]
      }
      enterprise_case_counters: {
        Row: {
          last_number: number
          org_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_case_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_cases: {
        Row: {
          assigned_at: string | null
          assigned_engineer_id: string | null
          cancelled_at: string | null
          case_number: string
          client_name: string | null
          client_ref: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          delivered_at: string | null
          description: string | null
          head_reviewer_id: string | null
          id: string
          org_id: string
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_engineer_id?: string | null
          cancelled_at?: string | null
          case_number: string
          client_name?: string | null
          client_ref?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          delivered_at?: string | null
          description?: string | null
          head_reviewer_id?: string | null
          id?: string
          org_id: string
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_engineer_id?: string | null
          cancelled_at?: string | null
          case_number?: string
          client_name?: string | null
          client_ref?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          delivered_at?: string | null
          description?: string | null
          head_reviewer_id?: string | null
          id?: string
          org_id?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          chunk_id: number | null
          content_type: string | null
          created_at: string | null
          description: string | null
          description_visual: string | null
          id: string
          keywords: string[] | null
          name: string
          name_ar: string | null
          numerical_value: string | null
          page_range: string | null
          sbc_source: string
          section_ref: string | null
          structured_table: string | null
          type: string
          unit: string | null
        }
        Insert: {
          chapter?: number | null
          chunk_id?: number | null
          content_type?: string | null
          created_at?: string | null
          description?: string | null
          description_visual?: string | null
          id?: string
          keywords?: string[] | null
          name: string
          name_ar?: string | null
          numerical_value?: string | null
          page_range?: string | null
          sbc_source: string
          section_ref?: string | null
          structured_table?: string | null
          type: string
          unit?: string | null
        }
        Update: {
          chapter?: number | null
          chunk_id?: number | null
          content_type?: string | null
          created_at?: string | null
          description?: string | null
          description_visual?: string | null
          id?: string
          keywords?: string[] | null
          name?: string
          name_ar?: string | null
          numerical_value?: string | null
          page_range?: string | null
          sbc_source?: string
          section_ref?: string | null
          structured_table?: string | null
          type?: string
          unit?: string | null
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
          image_urls: string[] | null
          role: string
          sources: string[] | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          role: string
          sources?: string[] | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
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
      mode_daily_usage: {
        Row: {
          count: number
          created_at: string
          id: string
          mode: string
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          mode: string
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          org_id: string
          role: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          org_id: string
          role?: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          org_id: string
          removed_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          org_id: string
          removed_at?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          org_id?: string
          removed_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          status: string
          trial_end: string
          trial_start: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          status?: string
          trial_end?: string
          trial_start?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          status?: string
          trial_end?: string
          trial_start?: string
          updated_at?: string
        }
        Relationships: []
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
          failure_code: string | null
          failure_message: string | null
          id: string
          moyasar_payment_id: string | null
          payment_type: string
          retry_count: number
          status: string
          subscription_id: string | null
          tap_charge_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          moyasar_payment_id?: string | null
          payment_type?: string
          retry_count?: number
          status?: string
          subscription_id?: string | null
          tap_charge_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          moyasar_payment_id?: string | null
          payment_type?: string
          retry_count?: number
          status?: string
          subscription_id?: string | null
          tap_charge_id?: string | null
          updated_at?: string
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
      plans: {
        Row: {
          annual_price: number
          created_at: string | null
          features: Json
          id: string
          interval: string
          name: string
          name_ar: string
          plan_type: string
          price: number
        }
        Insert: {
          annual_price?: number
          created_at?: string | null
          features?: Json
          id?: string
          interval?: string
          name: string
          name_ar: string
          plan_type: string
          price?: number
        }
        Update: {
          annual_price?: number
          created_at?: string | null
          features?: Json
          id?: string
          interval?: string
          name?: string
          name_ar?: string
          plan_type?: string
          price?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_cycle: string | null
          corporate_domain: string | null
          created_at: string
          daily_message_count: number | null
          daily_message_date: string | null
          id: string
          launch_source: string | null
          launch_trial_consumed: boolean | null
          launch_trial_end: string | null
          launch_trial_start: string | null
          launch_trial_status: string | null
          plan_type: string
          role: string
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
          launch_source?: string | null
          launch_trial_consumed?: boolean | null
          launch_trial_end?: string | null
          launch_trial_start?: string | null
          launch_trial_status?: string | null
          plan_type?: string
          role?: string
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
          launch_source?: string | null
          launch_trial_consumed?: boolean | null
          launch_trial_end?: string | null
          launch_trial_start?: string | null
          launch_trial_status?: string | null
          plan_type?: string
          role?: string
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
      sbc_code_tables: {
        Row: {
          chapter: number | null
          content_md: string
          created_at: string
          edition: string
          id: string
          keywords: string[]
          notes: string | null
          section: string | null
          source_code: string
          supersedes: string[] | null
          table_id: string
          table_title: string
        }
        Insert: {
          chapter?: number | null
          content_md: string
          created_at?: string
          edition?: string
          id?: string
          keywords?: string[]
          notes?: string | null
          section?: string | null
          source_code: string
          supersedes?: string[] | null
          table_id: string
          table_title: string
        }
        Update: {
          chapter?: number | null
          content_md?: string
          created_at?: string
          edition?: string
          id?: string
          keywords?: string[]
          notes?: string | null
          section?: string | null
          source_code?: string
          supersedes?: string[] | null
          table_id?: string
          table_title?: string
        }
        Relationships: []
      }
      sbc_documents: {
        Row: {
          canonical_section_id: string | null
          chapter_number: string | null
          chunk_index: number | null
          code_type: string | null
          content: string
          created_at: string | null
          embedding: string | null
          file_name: string | null
          id: number
          language: string
          metadata: Json
          normative: boolean
          page_end: number | null
          page_start: number | null
          section_number: string | null
        }
        Insert: {
          canonical_section_id?: string | null
          chapter_number?: string | null
          chunk_index?: number | null
          code_type?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          file_name?: string | null
          id?: number
          language?: string
          metadata?: Json
          normative?: boolean
          page_end?: number | null
          page_start?: number | null
          section_number?: string | null
        }
        Update: {
          canonical_section_id?: string | null
          chapter_number?: string | null
          chunk_index?: number | null
          code_type?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          file_name?: string | null
          id?: number
          language?: string
          metadata?: Json
          normative?: boolean
          page_end?: number | null
          page_start?: number | null
          section_number?: string | null
        }
        Relationships: []
      }
      sbc_pages: {
        Row: {
          bucket: string
          chapter_id: string | null
          code_id: string
          code_text: string | null
          commentary: string | null
          created_at: string | null
          file_name: string
          full_text: string | null
          id: number
          json_page: number
          section_id: string | null
          title: string | null
          version: string | null
        }
        Insert: {
          bucket?: string
          chapter_id?: string | null
          code_id: string
          code_text?: string | null
          commentary?: string | null
          created_at?: string | null
          file_name: string
          full_text?: string | null
          id?: number
          json_page: number
          section_id?: string | null
          title?: string | null
          version?: string | null
        }
        Update: {
          bucket?: string
          chapter_id?: string | null
          code_id?: string
          code_text?: string | null
          commentary?: string | null
          created_at?: string | null
          file_name?: string
          full_text?: string | null
          id?: number
          json_page?: number
          section_id?: string | null
          title?: string | null
          version?: string | null
        }
        Relationships: []
      }
      source_registry: {
        Row: {
          authority_level: string
          coverage_verified: boolean
          created_at: string | null
          edition_year: number | null
          full_name_ar: string
          full_name_en: string
          ingestion_status: string
          jurisdiction: string
          last_validated: string | null
          source_id: string
          tier: number
          total_pages: number | null
          updated_at: string | null
          vector_indexed: boolean
        }
        Insert: {
          authority_level: string
          coverage_verified?: boolean
          created_at?: string | null
          edition_year?: number | null
          full_name_ar: string
          full_name_en: string
          ingestion_status?: string
          jurisdiction?: string
          last_validated?: string | null
          source_id: string
          tier: number
          total_pages?: number | null
          updated_at?: string | null
          vector_indexed?: boolean
        }
        Update: {
          authority_level?: string
          coverage_verified?: boolean
          created_at?: string | null
          edition_year?: number | null
          full_name_ar?: string
          full_name_en?: string
          ingestion_status?: string
          jurisdiction?: string
          last_validated?: string | null
          source_id?: string
          tier?: number
          total_pages?: number | null
          updated_at?: string | null
          vector_indexed?: boolean
        }
        Relationships: []
      }
      source_versions: {
        Row: {
          chunk_count: number | null
          created_by: string | null
          file_count: number | null
          gate_1_pass: boolean | null
          gate_2_pass: boolean | null
          gate_3_pass: boolean | null
          gate_4_pass: boolean | null
          gate_5_pass: boolean | null
          gate_6_pass: boolean | null
          id: number
          ingested_at: string | null
          notes: string | null
          source_id: string
          vector_row_count: number | null
        }
        Insert: {
          chunk_count?: number | null
          created_by?: string | null
          file_count?: number | null
          gate_1_pass?: boolean | null
          gate_2_pass?: boolean | null
          gate_3_pass?: boolean | null
          gate_4_pass?: boolean | null
          gate_5_pass?: boolean | null
          gate_6_pass?: boolean | null
          id?: number
          ingested_at?: string | null
          notes?: string | null
          source_id: string
          vector_row_count?: number | null
        }
        Update: {
          chunk_count?: number | null
          created_by?: string | null
          file_count?: number | null
          gate_1_pass?: boolean | null
          gate_2_pass?: boolean | null
          gate_3_pass?: boolean | null
          gate_4_pass?: boolean | null
          gate_5_pass?: boolean | null
          gate_6_pass?: boolean | null
          id?: number
          ingested_at?: string | null
          notes?: string | null
          source_id?: string
          vector_row_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "source_versions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["source_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          duration_days: number
          features: Json
          features_access: Json | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          plan_type: string | null
          price_amount: number
          slug: string | null
          target: string
          trial_period_days: number | null
          type: string
        }
        Insert: {
          created_at?: string
          currency?: string
          duration_days?: number
          features?: Json
          features_access?: Json | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          plan_type?: string | null
          price_amount: number
          slug?: string | null
          target?: string
          trial_period_days?: number | null
          type?: string
        }
        Update: {
          created_at?: string
          currency?: string
          duration_days?: number
          features?: Json
          features_access?: Json | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          plan_type?: string | null
          price_amount?: number
          slug?: string | null
          target?: string
          trial_period_days?: number | null
          type?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          card_brand: string | null
          card_last_four: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          dunning_notified_at: string | null
          id: string
          moyasar_card_token: string | null
          moyasar_payment_id: string | null
          next_billing_date: string | null
          past_due_since: string | null
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
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          card_brand?: string | null
          card_last_four?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          dunning_notified_at?: string | null
          id?: string
          moyasar_card_token?: string | null
          moyasar_payment_id?: string | null
          next_billing_date?: string | null
          past_due_since?: string | null
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
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          card_brand?: string | null
          card_last_four?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          dunning_notified_at?: string | null
          id?: string
          moyasar_card_token?: string | null
          moyasar_payment_id?: string | null
          next_billing_date?: string | null
          past_due_since?: string | null
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
      validation_runs: {
        Row: {
          details: Json
          gate: number
          id: number
          passed: boolean
          run_at: string | null
          script_name: string | null
          source_id: string
        }
        Insert: {
          details?: Json
          gate: number
          id?: number
          passed: boolean
          run_at?: string | null
          script_name?: string | null
          source_id: string
        }
        Update: {
          details?: Json
          gate?: number
          id?: number
          passed?: boolean
          run_at?: string | null
          script_name?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["source_id"]
          },
        ]
      }
      webhook_dead_letters: {
        Row: {
          charge_id: string | null
          created_at: string
          id: string
          payload: Json
          reason: string
          tap_status: string | null
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          id?: string
          payload: Json
          reason: string
          tap_status?: string | null
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          reason?: string
          tap_status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_ai_report_version: {
        Args: {
          p_citations?: Json
          p_confidence_note?: string
          p_document_id?: string
          p_evidence_json?: Json
          p_model_name: string
          p_model_provider?: string
          p_output_language?: string
          p_prompt_snapshot?: string
          p_report_mode: string
          p_response_content: string
          p_session_id: string
          p_sources?: Json
          p_title: string
        }
        Returns: string
      }
      create_case_ai_session: {
        Args: {
          p_case_id: string
          p_conversation_id?: string
          p_session_mode: string
          p_title?: string
        }
        Returns: string
      }
      create_enterprise_case: {
        Args: {
          p_client_name?: string
          p_client_ref?: string
          p_description?: string
          p_org_id: string
          p_title: string
        }
        Returns: string
      }
      create_organization_with_owner: {
        Args: { p_name: string }
        Returns: string
      }
      decide_ai_report_version: {
        Args: {
          p_decision: string
          p_decision_note?: string
          p_report_version_id: string
        }
        Returns: string
      }
      decide_case_approval: {
        Args: {
          p_case_id: string
          p_decision: string
          p_decision_note?: string
        }
        Returns: string
      }
      decrement_mode_daily_count: {
        Args: { p_mode: string; p_user_id: string }
        Returns: undefined
      }
      get_all_mode_daily_counts: {
        Args: { p_user_id: string }
        Returns: {
          count: number
          mode: string
        }[]
      }
      get_daily_usage: { Args: { p_user_id: string }; Returns: number }
      get_indexed_chunk_count: { Args: never; Returns: number }
      get_mode_daily_count: {
        Args: { p_mode: string; p_user_id: string }
        Returns: number
      }
      get_node_neighbors: {
        Args: { p_limit?: number; p_node_ids: string[] }
        Returns: {
          description: string
          description_visual: string
          name: string
          node_id: string
          rel_description: string
          rel_type: string
          sbc_source: string
          section_ref: string
          structured_table: string
          type: string
          weight: number
        }[]
      }
      get_org_member_role: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: string
      }
      get_unindexed_chunks: {
        Args: { p_batch_size?: number }
        Returns: {
          chapter_number: string
          code_type: string
          content: string
          file_name: string
          id: number
          page_end: number
          page_start: number
          section_number: string
        }[]
      }
      increment_daily_usage: { Args: { p_user_id: string }; Returns: number }
      increment_mode_daily_count: {
        Args: { p_mode: string; p_user_id: string }
        Returns: number
      }
      is_active_case_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_active_org_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_case_assignee: {
        Args: { p_case_id: string; p_user_id: string }
        Returns: boolean
      }
      is_org_owner: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_org_owner_or_admin: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      link_ai_report_to_review: {
        Args: { p_report_version_id: string; p_review_id: string }
        Returns: string
      }
      match_sbc_documents: {
        Args: {
          filter_code?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chapter_number: string
          code_type: string
          content: string
          file_name: string
          id: number
          metadata: Json
          page_end: number
          page_start: number
          section_number: string
          similarity: number
        }[]
      }
      search_graph_nodes: {
        Args: {
          p_chapter?: number
          p_keywords: string[]
          p_limit?: number
          p_sbc_source?: string
        }
        Returns: {
          chapter: number
          chunk_id: number
          description: string
          description_visual: string
          id: string
          keywords: string[]
          name: string
          name_ar: string
          sbc_source: string
          section_ref: string
          structured_table: string
          type: string
        }[]
      }
      submit_case_review: {
        Args: {
          p_case_id: string
          p_findings?: Json
          p_recommendation?: string
          p_summary: string
        }
        Returns: string
      }
      transition_case_status: {
        Args: { p_case_id: string; p_note?: string; p_to_status: string }
        Returns: undefined
      }
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
