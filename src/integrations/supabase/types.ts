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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_decisions: {
        Row: {
          accepted: boolean | null
          accepted_by: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string
          error: string | null
          id: string
          input: Json | null
          kind: string
          latency_ms: number | null
          model: string | null
          org_id: string
          output: Json | null
          requires_human_review: boolean
        }
        Insert: {
          accepted?: boolean | null
          accepted_by?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error?: string | null
          id?: string
          input?: Json | null
          kind: string
          latency_ms?: number | null
          model?: string | null
          org_id: string
          output?: Json | null
          requires_human_review?: boolean
        }
        Update: {
          accepted?: boolean | null
          accepted_by?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          id?: string
          input?: Json | null
          kind?: string
          latency_ms?: number | null
          model?: string | null
          org_id?: string
          output?: Json | null
          requires_human_review?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          org_id: string
          reason_codes: string[]
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          org_id: string
          reason_codes?: string[]
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          org_id?: string
          reason_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          end_time: string
          id: string
          org_id: string
          start_time: string
          user_id: string
          weekday: number
        }
        Insert: {
          end_time?: string
          id?: string
          org_id: string
          start_time?: string
          user_id: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          org_id?: string
          start_time?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          org_id: string
          row_counts: Json
          size_bytes: number | null
          status: string
          storage_key: string | null
          triggered_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          org_id: string
          row_counts?: Json
          size_bytes?: number | null
          status?: string
          storage_key?: string | null
          triggered_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          org_id?: string
          row_counts?: Json
          size_bytes?: number | null
          status?: string
          storage_key?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancelled: boolean
          check_in: string
          check_out: string
          check_out_time: string
          created_at: string
          external_ref: string | null
          guest_name: string | null
          guests: number
          id: string
          next_check_in_time: string
          org_id: string
          property_id: string
          source: Database["public"]["Enums"]["booking_source"]
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          check_in: string
          check_out: string
          check_out_time?: string
          created_at?: string
          external_ref?: string | null
          guest_name?: string | null
          guests?: number
          id?: string
          next_check_in_time?: string
          org_id: string
          property_id: string
          source?: Database["public"]["Enums"]["booking_source"]
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          check_in?: string
          check_out?: string
          check_out_time?: string
          created_at?: string
          external_ref?: string | null
          guest_name?: string | null
          guests?: number
          id?: string
          next_check_in_time?: string
          org_id?: string
          property_id?: string
          source?: Database["public"]["Enums"]["booking_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          id: string
          label: string
          org_id: string
          position: number
          requires_photo: boolean
          room: string
        }
        Insert: {
          checklist_id: string
          id?: string
          label: string
          org_id: string
          position?: number
          requires_photo?: boolean
          room?: string
        }
        Update: {
          checklist_id?: string
          id?: string
          label?: string
          org_id?: string
          position?: number
          requires_photo?: boolean
          room?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          org_id: string
          task_type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          task_type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          task_type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_profiles: {
        Row: {
          active: boolean
          base_city: string | null
          cancellations_30d: number
          created_at: string
          id: string
          max_daily_tasks: number
          org_id: string
          quality_score: number
          reliability: number
          skills: string[]
          tasks_completed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          base_city?: string | null
          cancellations_30d?: number
          created_at?: string
          id?: string
          max_daily_tasks?: number
          org_id: string
          quality_score?: number
          reliability?: number
          skills?: string[]
          tasks_completed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          base_city?: string | null
          cancellations_30d?: number
          created_at?: string
          id?: string
          max_daily_tasks?: number
          org_id?: string
          quality_score?: number
          reliability?: number
          skills?: string[]
          tasks_completed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reviews: {
        Row: {
          cleanliness: number | null
          comment: string | null
          communication: number | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          org_id: string
          property_id: string | null
          rating: number
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          source: string
          status: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          cleanliness?: number | null
          comment?: string | null
          communication?: number | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          org_id: string
          property_id?: string | null
          rating: number
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          source?: string
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          cleanliness?: number | null
          comment?: string | null
          communication?: number | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          org_id?: string
          property_id?: string | null
          rating?: number
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          source?: string
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reviews_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          max_uses: number
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          uses: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number
          org_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          uses?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          ai_confidence: number | null
          ai_summary: string | null
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string
          id: string
          org_id: string
          photo_key: string | null
          property_id: string
          reported_by: string | null
          requires_human_review: boolean
          resolved_at: string | null
          severity: Database["public"]["Enums"]["maint_severity"] | null
          status: Database["public"]["Enums"]["maint_status"]
          task_id: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_summary?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description: string
          id?: string
          org_id: string
          photo_key?: string | null
          property_id: string
          reported_by?: string | null
          requires_human_review?: boolean
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["maint_severity"] | null
          status?: Database["public"]["Enums"]["maint_status"]
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_summary?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          org_id?: string
          photo_key?: string | null
          property_id?: string
          reported_by?: string | null
          requires_human_review?: boolean
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["maint_severity"] | null
          status?: Database["public"]["Enums"]["maint_status"]
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          body: string | null
          channel: Database["public"]["Enums"]["notify_channel"]
          created_at: string
          error: string | null
          id: string
          org_id: string
          payload: Json
          read_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notify_status"]
          subject: string | null
          template: string
          to_address: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          body?: string | null
          channel?: Database["public"]["Enums"]["notify_channel"]
          created_at?: string
          error?: string | null
          id?: string
          org_id: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notify_status"]
          subject?: string | null
          template: string
          to_address?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string | null
          channel?: Database["public"]["Enums"]["notify_channel"]
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notify_status"]
          subject?: string | null
          template?: string
          to_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
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
          created_by: string
          currency: string
          id: string
          name: string
          qc_auto_threshold: number
          qc_review_threshold: number
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          name: string
          qc_auto_threshold?: number
          qc_review_threshold?: number
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          name?: string
          qc_auto_threshold?: number
          qc_review_threshold?: number
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          ai_confidence: number | null
          ai_result: Json | null
          ai_status: Database["public"]["Enums"]["photo_ai_status"]
          created_at: string
          id: string
          org_id: string
          photo_type: string
          room: string
          storage_key: string
          task_id: string
          task_item_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_result?: Json | null
          ai_status?: Database["public"]["Enums"]["photo_ai_status"]
          created_at?: string
          id?: string
          org_id: string
          photo_type?: string
          room?: string
          storage_key: string
          task_id: string
          task_item_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_result?: Json | null
          ai_status?: Database["public"]["Enums"]["photo_ai_status"]
          created_at?: string
          id?: string
          org_id?: string
          photo_type?: string
          room?: string
          storage_key?: string
          task_id?: string
          task_item_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_task_item_id_fkey"
            columns: ["task_item_id"]
            isOneToOne: false
            referencedRelation: "task_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          locale: string
          phone_enc: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          locale?: string
          phone_enc?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          locale?: string
          phone_enc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          access_code_enc: string | null
          active: boolean
          address_enc: string | null
          bathrooms: number
          bedrooms: number
          city: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
          turnover_minutes: number
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          access_code_enc?: string | null
          active?: boolean
          address_enc?: string | null
          bathrooms?: number
          bedrooms?: number
          city?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          turnover_minutes?: number
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          access_code_enc?: string | null
          active?: boolean
          address_enc?: string | null
          bathrooms?: number
          bedrooms?: number
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          turnover_minutes?: number
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_items: {
        Row: {
          done: boolean
          done_at: string | null
          id: string
          label: string
          org_id: string
          position: number
          requires_photo: boolean
          room: string
          task_id: string
        }
        Insert: {
          done?: boolean
          done_at?: string | null
          id?: string
          label: string
          org_id: string
          position?: number
          requires_photo?: boolean
          room?: string
          task_id: string
        }
        Update: {
          done?: boolean
          done_at?: string | null
          id?: string
          label?: string
          org_id?: string
          position?: number
          requires_photo?: boolean
          room?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          booking_id: string | null
          checklist_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          notes: string | null
          org_id: string
          property_id: string
          qc_score: number | null
          qc_status: Database["public"]["Enums"]["qc_status"]
          qc_summary: string | null
          scheduled_start: string
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          submitted_at: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          checklist_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at: string
          id?: string
          notes?: string | null
          org_id: string
          property_id: string
          qc_score?: number | null
          qc_status?: Database["public"]["Enums"]["qc_status"]
          qc_summary?: string | null
          scheduled_start: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          submitted_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          checklist_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          property_id?: string
          qc_score?: number | null
          qc_status?: Database["public"]["Enums"]["qc_status"]
          qc_summary?: string | null
          scheduled_start?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          submitted_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          ends_at: string
          id: string
          org_id: string
          reason: string | null
          starts_at: string
          user_id: string
        }
        Insert: {
          ends_at: string
          id?: string
          org_id: string
          reason?: string | null
          starts_at: string
          user_id: string
        }
        Update: {
          ends_at?: string
          id?: string
          org_id?: string
          reason?: string | null
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      is_org_staff: { Args: { _org: string }; Returns: boolean }
      try_uuid: { Args: { _t: string }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "manager" | "supervisor" | "cleaner" | "technician"
      booking_source:
        | "manual"
        | "csv"
        | "airbnb"
        | "booking_com"
        | "agoda"
        | "direct"
        | "other"
      maint_severity: "low" | "medium" | "high" | "critical"
      maint_status: "open" | "triaged" | "assigned" | "resolved" | "dismissed"
      member_status: "pending" | "active" | "suspended"
      notify_channel: "in_app" | "email" | "whatsapp"
      notify_status: "queued" | "sent" | "failed" | "skipped" | "read"
      photo_ai_status:
        | "pending"
        | "processing"
        | "pass"
        | "needs_review"
        | "fail"
        | "error"
      qc_status: "pending" | "pass" | "needs_review" | "fail" | "skipped"
      task_status:
        | "unassigned"
        | "assigned"
        | "in_progress"
        | "submitted"
        | "needs_review"
        | "completed"
        | "cancelled"
      task_type:
        | "turnover_clean"
        | "deep_clean"
        | "inspection"
        | "maintenance"
        | "restock"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "manager", "supervisor", "cleaner", "technician"],
      booking_source: [
        "manual",
        "csv",
        "airbnb",
        "booking_com",
        "agoda",
        "direct",
        "other",
      ],
      maint_severity: ["low", "medium", "high", "critical"],
      maint_status: ["open", "triaged", "assigned", "resolved", "dismissed"],
      member_status: ["pending", "active", "suspended"],
      notify_channel: ["in_app", "email", "whatsapp"],
      notify_status: ["queued", "sent", "failed", "skipped", "read"],
      photo_ai_status: [
        "pending",
        "processing",
        "pass",
        "needs_review",
        "fail",
        "error",
      ],
      qc_status: ["pending", "pass", "needs_review", "fail", "skipped"],
      task_status: [
        "unassigned",
        "assigned",
        "in_progress",
        "submitted",
        "needs_review",
        "completed",
        "cancelled",
      ],
      task_type: [
        "turnover_clean",
        "deep_clean",
        "inspection",
        "maintenance",
        "restock",
      ],
    },
  },
} as const
