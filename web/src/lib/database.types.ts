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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      completion_events: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          delivery_kind: string | null
          event_key: string | null
          external_reference: string | null
          id: string
          job_id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json | null
          recipient: string | null
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          delivery_kind?: string | null
          event_key?: string | null
          external_reference?: string | null
          id?: string
          job_id: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json | null
          recipient?: string | null
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          delivery_kind?: string | null
          event_key?: string | null
          external_reference?: string | null
          id?: string
          job_id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json | null
          recipient?: string | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completion_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "transcription_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_configuration: {
        Row: {
          key: string
          public_value: string
          updated_at: string
        }
        Insert: {
          key: string
          public_value: string
          updated_at?: string
        }
        Update: {
          key?: string
          public_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_address: string | null
          email_notifications_enabled: boolean
          notify_batch_complete: boolean
          notify_each_recording: boolean
          notify_failures: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_address?: string | null
          email_notifications_enabled?: boolean
          notify_batch_complete?: boolean
          notify_each_recording?: boolean
          notify_failures?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_address?: string | null
          email_notifications_enabled?: boolean
          notify_batch_complete?: boolean
          notify_each_recording?: boolean
          notify_failures?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_notification_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          event_key: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          state: string
          subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          event_key: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          sent_at?: string | null
          state?: string
          subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_key?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          state?: string
          subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          device_name: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          device_name?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          device_name?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recording_user_states: {
        Row: {
          archived_at: string | null
          created_at: string
          done_at: string | null
          everything_copied_at: string | null
          job_id: string
          summary_copied_at: string | null
          transcript_copied_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          done_at?: string | null
          everything_copied_at?: string | null
          job_id: string
          summary_copied_at?: string | null
          transcript_copied_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          done_at?: string | null
          everything_copied_at?: string | null
          job_id?: string
          summary_copied_at?: string | null
          transcript_copied_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_user_states_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "transcription_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_job_parts: {
        Row: {
          created_at: string
          id: string
          job_id: string
          mime_type: string
          part_index: number
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          mime_type: string
          part_index: number
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          mime_type?: string
          part_index?: number
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_job_parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "transcription_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_jobs: {
        Row: {
          attempt_count: number
          batch_id: string
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          id: string
          lease_expires_at: string | null
          mime_type: string
          original_filename: string
          progress: number
          size_bytes: number
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          batch_id: string
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          mime_type: string
          original_filename: string
          progress?: number
          size_bytes: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          batch_id?: string
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          mime_type?: string
          original_filename?: string
          progress?: number
          size_bytes?: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_results: {
        Row: {
          action_items: string[]
          created_at: string
          detected_language: string | null
          job_id: string
          key_points: string[]
          processing_seconds: number | null
          segments: Json
          summary: string
          summary_model: string
          transcript: string
          transcription_model: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: string[]
          created_at?: string
          detected_language?: string | null
          job_id: string
          key_points?: string[]
          processing_seconds?: number | null
          segments?: Json
          summary: string
          summary_model: string
          transcript: string
          transcription_model: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: string[]
          created_at?: string
          detected_language?: string | null
          job_id?: string
          key_points?: string[]
          processing_seconds?: number | null
          segments?: Json
          summary?: string
          summary_model?: string
          transcript?: string
          transcription_model?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "transcription_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_batches: {
        Row: {
          created_at: string
          file_count: number
          id: string
          label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_count: number
          id?: string
          label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_count?: number
          id?: string
          label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_heartbeats: {
        Row: {
          current_job_id: string | null
          last_seen_at: string
          state: string
          version: string
          worker_id: string
        }
        Insert: {
          current_job_id?: string | null
          last_seen_at?: string
          state: string
          version: string
          worker_id: string
        }
        Update: {
          current_job_id?: string | null
          last_seen_at?: string
          state?: string
          version?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_heartbeats_current_job_id_fkey"
            columns: ["current_job_id"]
            isOneToOne: false
            referencedRelation: "transcription_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_next_job: {
        Args: { p_worker_id: string }
        Returns: {
          attempt_count: number
          batch_id: string
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          id: string
          lease_expires_at: string | null
          mime_type: string
          original_filename: string
          progress: number
          size_bytes: number
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          storage_path: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transcription_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_upload_batch: {
        Args: { p_files: Json; p_label: string }
        Returns: string
      }
      retry_transcription_job: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      worker_is_online: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      job_status:
        | "queued"
        | "transcribing"
        | "summarizing"
        | "completed"
        | "failed"
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
    Enums: {
      job_status: [
        "queued",
        "transcribing",
        "summarizing",
        "completed",
        "failed",
      ],
    },
  },
} as const
