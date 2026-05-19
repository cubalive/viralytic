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
      assets: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          job_id: string | null
          metadata: Json | null
          mime_type: string | null
          organization_id: string
          provider: string | null
          public_url: string | null
          storage_path: string
          type: string
          width: number | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          organization_id: string
          provider?: string | null
          public_url?: string | null
          storage_path: string
          type: string
          width?: number | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          organization_id?: string
          provider?: string | null
          public_url?: string | null
          storage_path?: string
          type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          brand_colors: Json | null
          created_at: string | null
          forbidden_words: string[] | null
          id: string
          language: string | null
          name: string
          organization_id: string
          target_audience: string | null
          tone: string | null
          unique_selling_points: string[] | null
        }
        Insert: {
          brand_colors?: Json | null
          created_at?: string | null
          forbidden_words?: string[] | null
          id?: string
          language?: string | null
          name: string
          organization_id: string
          target_audience?: string | null
          tone?: string | null
          unique_selling_points?: string[] | null
        }
        Update: {
          brand_colors?: Json | null
          created_at?: string | null
          forbidden_words?: string[] | null
          id?: string
          language?: string | null
          name?: string
          organization_id?: string
          target_audience?: string | null
          tone?: string | null
          unique_selling_points?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_videos: {
        Row: {
          analyzed_at: string | null
          comments: number | null
          duration_seconds: number | null
          embedding: string | null
          framework_detected: string | null
          hook_text: string | null
          hook_type: string | null
          id: string
          likes: number | null
          product_id: string
          shares: number | null
          thumbnail_url: string | null
          tiktok_url: string | null
          transcript: string | null
          views: number | null
        }
        Insert: {
          analyzed_at?: string | null
          comments?: number | null
          duration_seconds?: number | null
          embedding?: string | null
          framework_detected?: string | null
          hook_text?: string | null
          hook_type?: string | null
          id?: string
          likes?: number | null
          product_id: string
          shares?: number | null
          thumbnail_url?: string | null
          tiktok_url?: string | null
          transcript?: string | null
          views?: number | null
        }
        Update: {
          analyzed_at?: string | null
          comments?: number | null
          duration_seconds?: number | null
          embedding?: string | null
          framework_detected?: string | null
          hook_text?: string | null
          hook_type?: string | null
          id?: string
          likes?: number | null
          product_id?: string
          shares?: number | null
          thumbnail_url?: string | null
          tiktok_url?: string | null
          transcript?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          comments: number | null
          completion_rate: number | null
          conversions: number | null
          ctr: number | null
          id: string
          likes: number | null
          publication_id: string
          recorded_at: string | null
          revenue_cents: number | null
          saves: number | null
          shares: number | null
          views: number | null
          watch_time_avg_seconds: number | null
        }
        Insert: {
          comments?: number | null
          completion_rate?: number | null
          conversions?: number | null
          ctr?: number | null
          id?: string
          likes?: number | null
          publication_id: string
          recorded_at?: string | null
          revenue_cents?: number | null
          saves?: number | null
          shares?: number | null
          views?: number | null
          watch_time_avg_seconds?: number | null
        }
        Update: {
          comments?: number | null
          completion_rate?: number | null
          conversions?: number | null
          ctr?: number | null
          id?: string
          likes?: number | null
          publication_id?: string
          recorded_at?: string | null
          revenue_cents?: number | null
          saves?: number | null
          shares?: number | null
          views?: number | null
          watch_time_avg_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          monthly_video_quota: number | null
          name: string
          plan: string
          quota_resets_at: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          videos_used_this_month: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          monthly_video_quota?: number | null
          name: string
          plan?: string
          quota_resets_at?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          videos_used_this_month?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          monthly_video_quota?: number | null
          name?: string
          plan?: string
          quota_resets_at?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          videos_used_this_month?: number | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          features: Json | null
          id: string
          images: string[] | null
          organization_id: string
          pain_points: Json | null
          positive_reviews: Json | null
          price: number | null
          scraped_at: string | null
          source_platform: string | null
          source_url: string
          title: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          images?: string[] | null
          organization_id: string
          pain_points?: Json | null
          positive_reviews?: Json | null
          price?: number | null
          scraped_at?: string | null
          source_platform?: string | null
          source_url: string
          title?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          images?: string[] | null
          organization_id?: string
          pain_points?: Json | null
          positive_reviews?: Json | null
          price?: number | null
          scraped_at?: string | null
          source_platform?: string | null
          source_url?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          caption: string | null
          created_at: string | null
          error_message: string | null
          hashtags: string[] | null
          id: string
          job_id: string
          posted_at: string | null
          scheduled_at: string | null
          status: string | null
          tiktok_account_id: string | null
          tiktok_post_id: string | null
          tiktok_post_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          job_id: string
          posted_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          tiktok_account_id?: string | null
          tiktok_post_id?: string | null
          tiktok_post_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          job_id?: string
          posted_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          tiktok_account_id?: string | null
          tiktok_post_id?: string | null
          tiktok_post_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          body: string | null
          created_at: string | null
          cta: string | null
          embedding: string | null
          emotion_tags: string[] | null
          estimated_duration_seconds: number | null
          framework: string | null
          full_text: string
          hook: string | null
          id: string
          job_id: string
          selected: boolean | null
          variant: number
          visual_cues: Json | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          cta?: string | null
          embedding?: string | null
          emotion_tags?: string[] | null
          estimated_duration_seconds?: number | null
          framework?: string | null
          full_text: string
          hook?: string | null
          id?: string
          job_id: string
          selected?: boolean | null
          variant: number
          visual_cues?: Json | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          cta?: string | null
          embedding?: string | null
          emotion_tags?: string[] | null
          estimated_duration_seconds?: number | null
          framework?: string | null
          full_text?: string
          hook?: string | null
          id?: string
          job_id?: string
          selected?: boolean | null
          variant?: number
          visual_cues?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scripts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_lists: {
        Row: {
          created_at: string | null
          id: string
          job_id: string
          notes: string | null
          shots: Json
          total_duration_seconds: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id: string
          notes?: string | null
          shots: Json
          total_duration_seconds?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          shots?: Json
          total_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shot_lists_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_accounts: {
        Row: {
          access_token_encrypted: string
          created_at: string | null
          display_name: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          refresh_token_encrypted: string
          scopes: string[] | null
          tiktok_user_id: string | null
          username: string | null
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          refresh_token_encrypted: string
          scopes?: string[] | null
          tiktok_user_id?: string | null
          username?: string | null
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          refresh_token_encrypted?: string
          scopes?: string[] | null
          tiktok_user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_products: {
        Row: {
          category: string | null
          competition_level: string | null
          discovered_at: string | null
          estimated_price: number | null
          growth_rate_7d: number | null
          id: string
          language: string
          product_url: string | null
          region: string
          source: string
          thumbnail_url: string | null
          title: string
          top_video_urls: string[] | null
          virality_score: number
        }
        Insert: {
          category?: string | null
          competition_level?: string | null
          discovered_at?: string | null
          estimated_price?: number | null
          growth_rate_7d?: number | null
          id?: string
          language: string
          product_url?: string | null
          region: string
          source: string
          thumbnail_url?: string | null
          title: string
          top_video_urls?: string[] | null
          virality_score: number
        }
        Update: {
          category?: string | null
          competition_level?: string | null
          discovered_at?: string | null
          estimated_price?: number | null
          growth_rate_7d?: number | null
          id?: string
          language?: string
          product_url?: string | null
          region?: string
          source?: string
          thumbnail_url?: string | null
          title?: string
          top_video_urls?: string[] | null
          virality_score?: number
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          cost_cents: number | null
          created_at: string | null
          id: string
          job_id: string | null
          organization_id: string
          quantity: number
          type: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          organization_id: string
          quantity: number
          type: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          organization_id?: string
          quantity?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_jobs: {
        Row: {
          brand_id: string | null
          created_at: string | null
          created_by: string | null
          current_step: string | null
          error_message: string | null
          id: string
          mode: string
          organization_id: string
          product_id: string | null
          progress: number | null
          scheduled_for: string | null
          status: string
          tiktok_account_id: string | null
          total_cost_cents: number | null
          updated_at: string | null
          voice_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_step?: string | null
          error_message?: string | null
          id?: string
          mode: string
          organization_id: string
          product_id?: string | null
          progress?: number | null
          scheduled_for?: string | null
          status?: string
          tiktok_account_id?: string | null
          total_cost_cents?: number | null
          updated_at?: string | null
          voice_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_step?: string | null
          error_message?: string | null
          id?: string
          mode?: string
          organization_id?: string
          product_id?: string | null
          progress?: number | null
          scheduled_for?: string | null
          status?: string
          tiktok_account_id?: string | null
          total_cost_cents?: number | null
          updated_at?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          brand_id: string | null
          created_at: string | null
          default_similarity: number | null
          default_stability: number | null
          default_style: number | null
          elevenlabs_voice_id: string
          id: string
          language: string | null
          name: string
          organization_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          default_similarity?: number | null
          default_stability?: number | null
          default_style?: number | null
          elevenlabs_voice_id: string
          id?: string
          language?: string | null
          name: string
          organization_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          default_similarity?: number | null
          default_stability?: number | null
          default_style?: number | null
          elevenlabs_voice_id?: string
          id?: string
          language?: string | null
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voices_organization_id_fkey"
            columns: ["organization_id"]
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
      is_org_member: { Args: { org_id: string }; Returns: boolean }
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

