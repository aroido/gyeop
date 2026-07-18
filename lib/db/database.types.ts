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
          properties: Json;
          visitor_response_id: string | null;
        };
        Insert: {
          event_name: string;
          id?: string;
          occurred_at?: string;
          properties?: Json;
          visitor_response_id?: string | null;
        };
        Update: {
          event_name?: string;
          id?: string;
          occurred_at?: string;
          properties?: Json;
          visitor_response_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_visitor_response_id_fkey";
            columns: ["visitor_response_id"];
            isOneToOne: false;
            referencedRelation: "visitor_responses";
            referencedColumns: ["id"];
          },
        ];
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
          completed_at: string | null;
          created_at: string;
          current_position: number;
          id: string;
          last_active_at: string;
          management_expires_at: string;
          management_revoked_at: string | null;
          management_secret_hash: string | null;
          pack_version_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          current_position?: number;
          id: string;
          last_active_at: string;
          management_expires_at: string;
          management_revoked_at?: string | null;
          management_secret_hash?: string | null;
          pack_version_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          current_position?: number;
          id?: string;
          last_active_at?: string;
          management_expires_at?: string;
          management_revoked_at?: string | null;
          management_secret_hash?: string | null;
          pack_version_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
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
            foreignKeyName: "share_links_pack_play_id_fkey";
            columns: ["pack_play_id"];
            isOneToOne: false;
            referencedRelation: "pack_plays";
            referencedColumns: ["id"];
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
          created_at: string;
          id: string;
          known_since_code: string | null;
          management_token_hash: string | null;
          pack_version_id: string;
          relationship_code: string | null;
          session_expires_at: string;
          session_token_hash: string | null;
          share_link_id: string;
          status: string;
          submitted_at: string | null;
          withdrawn_at: string | null;
        };
        Insert: {
          created_at?: string;
          id: string;
          known_since_code?: string | null;
          management_token_hash?: string | null;
          pack_version_id: string;
          relationship_code?: string | null;
          session_expires_at: string;
          session_token_hash?: string | null;
          share_link_id: string;
          status?: string;
          submitted_at?: string | null;
          withdrawn_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          known_since_code?: string | null;
          management_token_hash?: string | null;
          pack_version_id?: string;
          relationship_code?: string | null;
          session_expires_at?: string;
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
      disable_share_link: {
        Args: {
          p_link_id: string;
          p_management_secret_hash: string;
          p_play_id: string;
        };
        Returns: Json;
      };
      get_invite_metadata: {
        Args: { p_public_id: string; p_secret_hash: string };
        Returns: Json;
      };
      get_owner_play: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      get_published_pack: { Args: { p_slug: string }; Returns: Json };
      list_owner_share_links: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: Json;
      };
      publish_pack_version: {
        Args: { p_pack_version_id: string };
        Returns: string;
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
      revoke_owner_play_session: {
        Args: { p_management_secret_hash: string; p_play_id: string };
        Returns: boolean;
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
