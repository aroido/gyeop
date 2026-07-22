export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      analytics_events: {
        Row: {
          event_name: string;
          id: string;
          occurred_at: string;
          owner_play_id: string | null;
          properties: Json;
          share_link_id: string | null;
          visitor_response_id: string | null;
        };
        Insert: {
          event_name: string;
          id?: string;
          occurred_at?: string;
          owner_play_id?: string | null;
          properties?: Json;
          share_link_id?: string | null;
          visitor_response_id?: string | null;
        };
        Update: {
          event_name?: string;
          id?: string;
          occurred_at?: string;
          owner_play_id?: string | null;
          properties?: Json;
          share_link_id?: string | null;
          visitor_response_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_owner_play_id_fkey";
            columns: ["owner_play_id"];
            isOneToOne: false;
            referencedRelation: "pack_plays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_share_link_id_fkey";
            columns: ["share_link_id"];
            isOneToOne: false;
            referencedRelation: "share_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_visitor_response_id_fkey";
            columns: ["visitor_response_id"];
            isOneToOne: false;
            referencedRelation: "visitor_responses";
            referencedColumns: ["id"];
          },
        ];
      };
      anonymous_owners: {
        Row: {
          created_at: string;
          id: string;
          last_active_at: string;
          management_expires_at: string;
          management_revoked_at: string | null;
          management_secret_hash: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          last_active_at: string;
          management_expires_at: string;
          management_revoked_at?: string | null;
          management_secret_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_active_at?: string;
          management_expires_at?: string;
          management_revoked_at?: string | null;
          management_secret_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pack_cards: {
        Row: {
          created_at: string;
          id: string;
          is_signature: boolean;
          option_a: string;
          option_b: string;
          owner_prompt: string;
          pack_version_id: string;
          position: number;
          visitor_prompt: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          is_signature?: boolean;
          option_a: string;
          option_b: string;
          owner_prompt: string;
          pack_version_id: string;
          position: number;
          visitor_prompt: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_signature?: boolean;
          option_a?: string;
          option_b?: string;
          owner_prompt?: string;
          pack_version_id?: string;
          position?: number;
          visitor_prompt?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pack_cards_pack_version_id_fkey";
            columns: ["pack_version_id"];
            isOneToOne: false;
            referencedRelation: "pack_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      pack_plays: {
        Row: {
          anonymous_owner_id: string;
          completed_at: string | null;
          created_at: string;
          current_position: number;
          id: string;
          last_active_at: string;
          management_expires_at: string;
          management_revoked_at: string | null;
          management_secret_hash: string | null;
          owner_id: string | null;
          pack_version_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          anonymous_owner_id: string;
          completed_at?: string | null;
          created_at?: string;
          current_position?: number;
          id: string;
          last_active_at: string;
          management_expires_at: string;
          management_revoked_at?: string | null;
          management_secret_hash?: string | null;
          owner_id?: string | null;
          pack_version_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          anonymous_owner_id?: string;
          completed_at?: string | null;
          created_at?: string;
          current_position?: number;
          id?: string;
          last_active_at?: string;
          management_expires_at?: string;
          management_revoked_at?: string | null;
          management_secret_hash?: string | null;
          owner_id?: string | null;
          pack_version_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pack_plays_anonymous_owner_fk";
            columns: ["anonymous_owner_id"];
            isOneToOne: false;
            referencedRelation: "anonymous_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pack_plays_pack_version_id_fkey";
            columns: ["pack_version_id"];
            isOneToOne: false;
            referencedRelation: "pack_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      pack_templates: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          published_version_id: string | null;
          sensitivity: string;
          slug: string;
          target_relationship: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          published_version_id?: string | null;
          sensitivity: string;
          slug: string;
          target_relationship: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          published_version_id?: string | null;
          sensitivity?: string;
          slug?: string;
          target_relationship?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pack_templates_published_version_fkey";
            columns: ["id", "published_version_id"];
            isOneToOne: true;
            referencedRelation: "pack_versions";
            referencedColumns: ["template_id", "id"];
          },
        ];
      };
      pack_versions: {
        Row: {
          created_at: string;
          id: string;
          published_at: string | null;
          template_id: string;
          version: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          published_at?: string | null;
          template_id: string;
          version: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          published_at?: string | null;
          template_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pack_versions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "pack_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_buckets: {
        Row: {
          action: string;
          count: number;
          expires_at: string;
          key_hash: string;
          window_start: string;
        };
        Insert: {
          action: string;
          count: number;
          expires_at: string;
          key_hash: string;
          window_start: string;
        };
        Update: {
          action?: string;
          count?: number;
          expires_at?: string;
          key_hash?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      self_answers: {
        Row: {
          card_id: string;
          choice: string;
          created_at: string;
          pack_play_id: string;
          pack_version_id: string;
          updated_at: string;
        };
        Insert: {
          card_id: string;
          choice: string;
          created_at?: string;
          pack_play_id: string;
          pack_version_id: string;
          updated_at?: string;
        };
        Update: {
          card_id?: string;
          choice?: string;
          created_at?: string;
          pack_play_id?: string;
          pack_version_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "self_answers_pack_play_id_pack_version_id_fkey";
            columns: ["pack_play_id", "pack_version_id"];
            isOneToOne: false;
            referencedRelation: "pack_plays";
            referencedColumns: ["id", "pack_version_id"];
          },
          {
            foreignKeyName: "self_answers_pack_version_id_card_id_fkey";
            columns: ["pack_version_id", "card_id"];
            isOneToOne: false;
            referencedRelation: "pack_cards";
            referencedColumns: ["pack_version_id", "id"];
          },
        ];
      };
      share_links: {
        Row: {
          consumed_at: string | null;
          consumed_response_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          kind: string;
          pack_play_id: string;
          public_id: string;
          secret_hash: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          consumed_at?: string | null;
          consumed_response_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id: string;
          kind: string;
          pack_play_id: string;
          public_id: string;
          secret_hash: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          consumed_at?: string | null;
          consumed_response_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          pack_play_id?: string;
          public_id?: string;
          secret_hash?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "share_links_consumed_response_binding_fkey";
            columns: ["consumed_response_id", "id"];
            isOneToOne: false;
            referencedRelation: "visitor_responses";
            referencedColumns: ["id", "share_link_id"];
          },
          {
            foreignKeyName: "share_links_pack_play_id_fkey";
            columns: ["pack_play_id"];
            isOneToOne: false;
            referencedRelation: "pack_plays";
            referencedColumns: ["id"];
          },
        ];
      };
      visitor_answers: {
        Row: {
          card_id: string;
          choice: string;
          created_at: string;
          pack_version_id: string;
          response_id: string;
          updated_at: string;
        };
        Insert: {
          card_id: string;
          choice: string;
          created_at?: string;
          pack_version_id: string;
          response_id: string;
          updated_at?: string;
        };
        Update: {
          card_id?: string;
          choice?: string;
          created_at?: string;
          pack_version_id?: string;
          response_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visitor_answers_response_id_pack_version_id_card_id_fkey";
            columns: ["response_id", "pack_version_id", "card_id"];
            isOneToOne: false;
            referencedRelation: "visitor_assignments";
            referencedColumns: ["response_id", "pack_version_id", "card_id"];
          },
        ];
      };
      visitor_assignments: {
        Row: {
          card_id: string;
          created_at: string;
          pack_version_id: string;
          position: number;
          response_id: string;
          stage: string;
        };
        Insert: {
          card_id: string;
          created_at?: string;
          pack_version_id: string;
          position: number;
          response_id: string;
          stage: string;
        };
        Update: {
          card_id?: string;
          created_at?: string;
          pack_version_id?: string;
          position?: number;
          response_id?: string;
          stage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visitor_assignments_pack_version_id_card_id_fkey";
            columns: ["pack_version_id", "card_id"];
            isOneToOne: false;
            referencedRelation: "pack_cards";
            referencedColumns: ["pack_version_id", "id"];
          },
          {
            foreignKeyName: "visitor_assignments_response_id_pack_version_id_fkey";
            columns: ["response_id", "pack_version_id"];
            isOneToOne: false;
            referencedRelation: "visitor_responses";
            referencedColumns: ["id", "pack_version_id"];
          },
        ];
      };
      visitor_responses: {
        Row: {
          created_at: string | null;
          id: string;
          known_since_code: string | null;
          management_token_hash: string | null;
          pack_version_id: string | null;
          relationship_code: string | null;
          session_expires_at: string | null;
          session_token_hash: string | null;
          share_link_id: string;
          status: string;
          submitted_at: string | null;
          withdrawn_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id: string;
          known_since_code?: string | null;
          management_token_hash?: string | null;
          pack_version_id?: string | null;
          relationship_code?: string | null;
          session_expires_at?: string | null;
          session_token_hash?: string | null;
          share_link_id: string;
          status?: string;
          submitted_at?: string | null;
          withdrawn_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          known_since_code?: string | null;
          management_token_hash?: string | null;
          pack_version_id?: string | null;
          relationship_code?: string | null;
          session_expires_at?: string | null;
          session_token_hash?: string | null;
          share_link_id?: string;
          status?: string;
          submitted_at?: string | null;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "visitor_responses_pack_version_id_fkey";
            columns: ["pack_version_id"];
            isOneToOne: false;
            referencedRelation: "pack_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visitor_responses_share_link_id_fkey";
            columns: ["share_link_id"];
            isOneToOne: false;
            referencedRelation: "share_links";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_optional_cards: {
        Args: { p_response_id: string; p_session_hash: string };
        Returns: Json;
      };
      claim_anonymous_owner: {
        Args: {
          p_actor_id: string;
          p_anonymous_owner_id: string;
          p_management_secret_hash: string;
          p_recovery_actor_candidates: Json;
        };
        Returns: Json;
      };
      complete_authenticated_owner_play: {
        Args: { p_actor_id: string; p_play_id: string };
        Returns: Json;
      };
      complete_owner_play: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      consume_rate_limit: {
        Args: {
          p_action: string;
          p_key_hash: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: {
          allowed: boolean;
          current_count: number;
          expires_at: string;
          limit_count: number;
          retry_after_seconds: number;
          window_start: string;
        }[];
      };
      create_authenticated_share_link: {
        Args: {
          p_actor_id: string;
          p_expires_at: string;
          p_kind: string;
          p_link_id: string;
          p_play_id: string;
          p_public_id: string;
          p_secret_hash: string;
        };
        Returns: Json;
      };
      create_claimed_share_link: {
        Args: {
          p_expires_at: string;
          p_kind: string;
          p_link_id: string;
          p_management_secret_hash: string;
          p_play_id: string;
          p_public_id: string;
          p_secret_hash: string;
        };
        Returns: Json;
      };
      create_or_resume_play: {
        Args: {
          p_existing_play_id: string;
          p_existing_secret_hash: string;
          p_network_key: string;
          p_new_play_id: string;
          p_new_secret_hash: string;
          p_pack_slug: string;
        };
        Returns: Json;
      };
      create_or_resume_play_with_source: {
        Args: {
          p_entry_source: string;
          p_existing_play_id: string;
          p_existing_secret_hash: string;
          p_network_key: string;
          p_new_play_id: string;
          p_new_secret_hash: string;
          p_pack_slug: string;
          p_source_response_id: string;
          p_source_session_hash: string;
        };
        Returns: Json;
      };
      create_share_link: {
        Args: {
          p_expires_at: string;
          p_kind: string;
          p_link_id: string;
          p_management_secret_hash: string;
          p_play_id: string;
          p_public_id: string;
          p_secret_hash: string;
        };
        Returns: Json;
      };
      disable_authenticated_share_link: {
        Args: { p_actor_id: string; p_link_id: string; p_play_id: string };
        Returns: Json;
      };
      disable_share_link: {
        Args: {
          p_link_id: string;
          p_management_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      get_authenticated_owner_play: {
        Args: { p_actor_id: string; p_play_id: string };
        Returns: Json;
      };
      get_authenticated_owner_profile: {
        Args: { p_actor_id: string; p_play_id: string };
        Returns: Json;
      };
      get_authenticated_private_1to1_comparison: {
        Args: { p_actor_id: string; p_play_id: string; p_response_id: string };
        Returns: Json;
      };
      get_invite_metadata: {
        Args: { p_public_id: string; p_secret_hash: string };
        Returns: Json;
      };
      get_owner_claim_state: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      get_owner_play: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      get_owner_profile: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      get_private_1to1_comparison: {
        Args: {
          p_management_secret_hash: string;
          p_play_id: string;
          p_response_id: string;
        };
        Returns: Json;
      };
      get_published_pack: { Args: { p_slug: string }; Returns: Json };
      get_visitor_response: {
        Args: { p_response_id: string; p_session_hash: string };
        Returns: Json;
      };
      get_visitor_response_pack_metadata: {
        Args: { p_response_id: string; p_session_hash: string };
        Returns: Json;
      };
      list_authenticated_owner_1to1_responses: {
        Args: { p_actor_id: string; p_play_id: string };
        Returns: Json;
      };
      list_authenticated_owner_plays: {
        Args: { p_actor_id: string };
        Returns: Json;
      };
      list_authenticated_share_links: {
        Args: { p_actor_id: string; p_play_id: string };
        Returns: Json;
      };
      list_owner_1to1_responses: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      list_owner_share_links: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      publish_pack_version: {
        Args: { p_pack_version_id: string };
        Returns: string;
      };
      record_authenticated_owner_profile_event: {
        Args: { p_actor_id: string; p_event_name: string; p_play_id: string };
        Returns: Json;
      };
      record_authenticated_owner_share_action: {
        Args: {
          p_actor_id: string;
          p_entry_source: string;
          p_event_name: string;
          p_link_id: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      record_owner_profile_event: {
        Args: {
          p_event_name: string;
          p_management_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      record_owner_share_action: {
        Args: {
          p_event_name: string;
          p_link_id: string;
          p_management_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      record_owner_share_action_with_source: {
        Args: {
          p_entry_source: string;
          p_event_name: string;
          p_link_id: string;
          p_management_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      record_visitor_response_event: {
        Args: {
          p_event_name: string;
          p_response_id: string;
          p_session_hash: string;
        };
        Returns: Json;
      };
      revoke_owner_play_session: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: boolean;
      };
      rotate_authenticated_share_link: {
        Args: {
          p_actor_id: string;
          p_link_id: string;
          p_new_link_id: string;
          p_new_public_id: string;
          p_new_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      rotate_share_link: {
        Args: {
          p_link_id: string;
          p_management_secret_hash: string;
          p_new_link_id: string;
          p_new_public_id: string;
          p_new_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      run_local_retention_cleanup: { Args: never; Returns: Json };
      save_authenticated_owner_answer: {
        Args: {
          p_actor_id: string;
          p_card_id: string;
          p_choice: string;
          p_current_position: number;
          p_play_id: string;
        };
        Returns: Json;
      };
      save_owner_answer: {
        Args: {
          p_card_id: string;
          p_choice: string;
          p_current_position: number;
          p_management_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      save_response_answer: {
        Args: {
          p_card_id: string;
          p_choice: string;
          p_response_id: string;
          p_session_hash: string;
        };
        Returns: Json;
      };
      start_required_response: {
        Args: {
          p_existing_response_id: string;
          p_existing_session_hash: string;
          p_intent: string;
          p_known_since_code: string;
          p_new_response_id: string;
          p_new_session_hash: string;
          p_public_id: string;
          p_rate_limit_key: string;
          p_relationship_code: string;
          p_secret_hash: string;
        };
        Returns: Json;
      };
      start_response: {
        Args: {
          p_existing_response_id: string;
          p_existing_session_hash: string;
          p_intent: string;
          p_known_since_code: string;
          p_new_response_id: string;
          p_new_session_hash: string;
          p_public_id: string;
          p_rate_limit_key: string;
          p_relationship_code: string;
          p_secret_hash: string;
        };
        Returns: Json;
      };
      submit_response: {
        Args: {
          p_management_hash: string;
          p_response_id: string;
          p_session_hash: string;
        };
        Returns: Json;
      };
      withdraw_response: { Args: { p_management_hash: string }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
