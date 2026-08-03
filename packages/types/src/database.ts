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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      broadcast_segments: {
        Row: {
          audio_path: string | null
          created_at: string | null
          hole_number: number | null
          id: string
          media_id: string | null
          round_id: string
          script: Json
        }
        Insert: {
          audio_path?: string | null
          created_at?: string | null
          hole_number?: number | null
          id?: string
          media_id?: string | null
          round_id: string
          script: Json
        }
        Update: {
          audio_path?: string | null
          created_at?: string | null
          hole_number?: number | null
          id?: string
          media_id?: string | null
          round_id?: string
          script?: Json
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_segments_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "round_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_segments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      course_search_log: {
        Row: {
          hits: number
          searched_at: string
          term: string
        }
        Insert: {
          hits?: number
          searched_at?: string
          term: string
        }
        Update: {
          hits?: number
          searched_at?: string
          term?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          city: string | null
          club_name: string | null
          country: string | null
          created_at: string | null
          external_id: string | null
          gps_checked_at: string | null
          gps_source: string | null
          hole_count: number
          id: string
          lat: number | null
          lng: number | null
          name: string
          needs_review: boolean
          raw: Json | null
          source: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          club_name?: string | null
          country?: string | null
          created_at?: string | null
          external_id?: string | null
          gps_checked_at?: string | null
          gps_source?: string | null
          hole_count?: number
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          needs_review?: boolean
          raw?: Json | null
          source: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          club_name?: string | null
          country?: string | null
          created_at?: string | null
          external_id?: string | null
          gps_checked_at?: string | null
          gps_source?: string | null
          hole_count?: number
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          needs_review?: boolean
          raw?: Json | null
          source?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crew_guests: {
        Row: {
          created_at: string | null
          crew_id: string
          id: string
          name: string
          vouched_by: string
        }
        Insert: {
          created_at?: string | null
          crew_id: string
          id?: string
          name: string
          vouched_by: string
        }
        Update: {
          created_at?: string | null
          crew_id?: string
          id?: string
          name?: string
          vouched_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_guests_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_guests_vouched_by_fkey"
            columns: ["vouched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          crew_id: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["crew_role"]
        }
        Insert: {
          crew_id: string
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["crew_role"]
        }
        Update: {
          crew_id?: string
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["crew_role"]
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          invite_code: string
          name: string
          roast_level: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          invite_code: string
          name: string
          roast_level?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          invite_code?: string
          name?: string
          roast_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "crews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string | null
          id: string
          last_seen_at: string | null
          platform: string
          profile_id: string
          push_token: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_seen_at?: string | null
          platform: string
          profile_id: string
          push_token: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_seen_at?: string | null
          platform?: string
          profile_id?: string
          push_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_comments: {
        Row: {
          body: string
          created_at: string | null
          feed_item_id: string
          id: string
          profile_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          feed_item_id: string
          id?: string
          profile_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          feed_item_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items: {
        Row: {
          actor_id: string | null
          created_at: string | null
          crew_id: string
          id: string
          payload: Json
          subject_id: string | null
          subject_type: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          crew_id: string
          id?: string
          payload?: Json
          subject_id?: string | null
          subject_type?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          crew_id?: string
          id?: string
          payload?: Json
          subject_id?: string | null
          subject_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string | null
          friend_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          friend_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_participants: {
        Row: {
          game_id: string
          round_player_id: string
          team_id: string | null
        }
        Insert: {
          game_id: string
          round_player_id: string
          team_id?: string | null
        }
        Update: {
          game_id?: string
          round_player_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_participants_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_participants_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          amount_cents: number
          breakdown: Json
          computed_at: string | null
          game_id: string
          id: string
          round_player_id: string
        }
        Insert: {
          amount_cents: number
          breakdown: Json
          computed_at?: string | null
          game_id: string
          id?: string
          round_player_id: string
        }
        Update: {
          amount_cents?: number
          breakdown?: Json
          computed_at?: string | null
          game_id?: string
          id?: string
          round_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          computed_at: string | null
          config: Json
          created_at: string | null
          created_by: string | null
          id: string
          name: string | null
          round_id: string | null
          trip_id: string | null
          type: Database["public"]["Enums"]["game_type"]
        }
        Insert: {
          computed_at?: string | null
          config: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          round_id?: string | null
          trip_id?: string | null
          type: Database["public"]["Enums"]["game_type"]
        }
        Update: {
          computed_at?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          round_id?: string | null
          trip_id?: string | null
          type?: Database["public"]["Enums"]["game_type"]
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_points: {
        Row: {
          course_id: string
          external_ref: string | null
          green_back_lat: number | null
          green_back_lng: number | null
          green_front_lat: number | null
          green_front_lng: number | null
          green_lat: number
          green_lng: number
          hole_number: number
          id: string
          source: string
          tee_lat: number | null
          tee_lng: number | null
          updated_at: string | null
        }
        Insert: {
          course_id: string
          external_ref?: string | null
          green_back_lat?: number | null
          green_back_lng?: number | null
          green_front_lat?: number | null
          green_front_lng?: number | null
          green_lat: number
          green_lng: number
          hole_number: number
          id?: string
          source: string
          tee_lat?: number | null
          tee_lng?: number | null
          updated_at?: string | null
        }
        Update: {
          course_id?: string
          external_ref?: string | null
          green_back_lat?: number | null
          green_back_lng?: number | null
          green_front_lat?: number | null
          green_front_lng?: number | null
          green_lat?: number
          green_lng?: number
          hole_number?: number
          id?: string
          source?: string
          tee_lat?: number | null
          tee_lng?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hole_points_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      holes: {
        Row: {
          id: string
          number: number
          par: number
          stroke_index: number
          tee_id: string
          yardage: number | null
        }
        Insert: {
          id?: string
          number: number
          par: number
          stroke_index: number
          tee_id: string
          yardage?: number | null
        }
        Update: {
          id?: string
          number?: number
          par?: number
          stroke_index?: number
          tee_id?: string
          yardage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holes_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "tees"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_cents: number
          batch_id: string | null
          created_at: string | null
          crew_id: string
          from_profile: string
          id: string
          note: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["ledger_source"]
          status: Database["public"]["Enums"]["ledger_status"]
          to_profile: string
          trip_id: string | null
        }
        Insert: {
          amount_cents: number
          batch_id?: string | null
          created_at?: string | null
          crew_id: string
          from_profile: string
          id?: string
          note?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["ledger_source"]
          status?: Database["public"]["Enums"]["ledger_status"]
          to_profile: string
          trip_id?: string | null
        }
        Update: {
          amount_cents?: number
          batch_id?: string | null
          created_at?: string | null
          crew_id?: string
          from_profile?: string
          id?: string
          note?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["ledger_source"]
          status?: Database["public"]["Enums"]["ledger_status"]
          to_profile?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_batch_fk"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "settlement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string | null
          crew_id: string | null
          id: string
          round_id: string | null
          trip_id: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string | null
          crew_id?: string | null
          id?: string
          round_id?: string | null
          trip_id?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string | null
          crew_id?: string | null
          id?: string
          round_id?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_batches: {
        Row: {
          created_at: string | null
          event_count: number
          flushed_at: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          round_id: string | null
          trip_id: string | null
          window_ends_at: string
        }
        Insert: {
          created_at?: string | null
          event_count?: number
          flushed_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          round_id?: string | null
          trip_id?: string | null
          window_ends_at?: string
        }
        Update: {
          created_at?: string | null
          event_count?: number
          flushed_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          round_id?: string | null
          trip_id?: string | null
          window_ends_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_batches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          enabled: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          profile_id: string
        }
        Insert: {
          enabled?: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          profile_id: string
        }
        Update: {
          enabled?: boolean
          kind?: Database["public"]["Enums"]["notification_kind"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          body: string
          created_at: string | null
          data: Json
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          profile_id: string
          send_after: string
          sent_at: string | null
          title: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string | null
          data?: Json
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          profile_id: string
          send_after?: string
          sent_at?: string | null
          title: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string | null
          data?: Json
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          profile_id?: string
          send_after?: string
          sent_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_clubs: {
        Row: {
          carry_yards: number
          created_at: string | null
          id: string
          name: string
          position: number
          profile_id: string
        }
        Insert: {
          carry_yards: number
          created_at?: string | null
          id?: string
          name: string
          position?: number
          profile_id: string
        }
        Update: {
          carry_yards?: number
          created_at?: string | null
          id?: string
          name?: string
          position?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_clubs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          display_name: string
          handicap_index: number | null
          handicap_source: Database["public"]["Enums"]["handicap_source"] | null
          handle: string
          home_course_id: string | null
          id: string
          phone_hash: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name: string
          handicap_index?: number | null
          handicap_source?:
            | Database["public"]["Enums"]["handicap_source"]
            | null
          handle: string
          home_course_id?: string | null
          id: string
          phone_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string
          handicap_index?: number | null
          handicap_source?:
            | Database["public"]["Enums"]["handicap_source"]
            | null
          handle?: string
          home_course_id?: string | null
          id?: string
          phone_hash?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_course_id_fkey"
            columns: ["home_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string | null
          emoji: string
          feed_item_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          feed_item_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          feed_item_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          cost_cents: number
          id: string
          name: string
          paid_by: string | null
          trip_id: string
        }
        Insert: {
          capacity: number
          cost_cents?: number
          id?: string
          name: string
          paid_by?: string | null
          trip_id: string
        }
        Update: {
          capacity?: number
          cost_cents?: number
          id?: string
          name?: string
          paid_by?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      round_media: {
        Row: {
          caption: string | null
          created_at: string | null
          hole_number: number | null
          id: string
          kind: string
          round_id: string
          storage_path: string
          subject_player_id: string | null
          uploaded_by: string
          used_at: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          hole_number?: number | null
          id?: string
          kind: string
          round_id: string
          storage_path: string
          subject_player_id?: string | null
          uploaded_by: string
          used_at?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          hole_number?: number | null
          id?: string
          kind?: string
          round_id?: string
          storage_path?: string
          subject_player_id?: string | null
          uploaded_by?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_media_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_media_subject_player_id_fkey"
            columns: ["subject_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      round_players: {
        Row: {
          created_at: string | null
          group_number: number | null
          guest_id: string | null
          id: string
          playing_handicap: number | null
          position: number | null
          profile_id: string | null
          round_id: string
          rsvp: Database["public"]["Enums"]["rsvp_status"]
          tee_id: string | null
        }
        Insert: {
          created_at?: string | null
          group_number?: number | null
          guest_id?: string | null
          id?: string
          playing_handicap?: number | null
          position?: number | null
          profile_id?: string | null
          round_id: string
          rsvp?: Database["public"]["Enums"]["rsvp_status"]
          tee_id?: string | null
        }
        Update: {
          created_at?: string | null
          group_number?: number | null
          guest_id?: string | null
          id?: string
          playing_handicap?: number | null
          position?: number | null
          profile_id?: string | null
          round_id?: string
          rsvp?: Database["public"]["Enums"]["rsvp_status"]
          tee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_players_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crew_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "tees"
            referencedColumns: ["id"]
          },
        ]
      }
      round_storylines: {
        Row: {
          body: string
          created_at: string | null
          id: string
          round_id: string
          subject_player_id: string
          submitted_by: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          round_id: string
          subject_player_id: string
          submitted_by: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          round_id?: string
          subject_player_id?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_storylines_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_storylines_subject_player_id_fkey"
            columns: ["subject_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_storylines_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          booking_external_id: string | null
          booking_provider: string | null
          booking_status: string | null
          booking_url: string | null
          completed_at: string | null
          course_id: string
          created_at: string | null
          created_by: string | null
          crew_id: string | null
          hole_count: number
          id: string
          max_players: number | null
          name: string | null
          nine: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["round_status"]
          tee_id: string | null
          timezone: string
          trip_id: string | null
          visibility: Database["public"]["Enums"]["round_visibility"]
        }
        Insert: {
          booking_external_id?: string | null
          booking_provider?: string | null
          booking_status?: string | null
          booking_url?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          hole_count?: number
          id?: string
          max_players?: number | null
          name?: string | null
          nine?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["round_status"]
          tee_id?: string | null
          timezone: string
          trip_id?: string | null
          visibility?: Database["public"]["Enums"]["round_visibility"]
        }
        Update: {
          booking_external_id?: string | null
          booking_provider?: string | null
          booking_status?: string | null
          booking_url?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          hole_count?: number
          id?: string
          max_players?: number | null
          name?: string | null
          nine?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["round_status"]
          tee_id?: string | null
          timezone?: string
          trip_id?: string | null
          visibility?: Database["public"]["Enums"]["round_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "tees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          client_id: string
          client_updated_at: string
          hole_number: number
          id: string
          penalties: number | null
          putts: number | null
          round_player_id: string
          strokes: number | null
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        Insert: {
          client_id: string
          client_updated_at: string
          hole_number: number
          id?: string
          penalties?: number | null
          putts?: number | null
          round_player_id: string
          strokes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          client_id?: string
          client_updated_at?: string
          hole_number?: number
          id?: string
          penalties?: number | null
          putts?: number | null
          round_player_id?: string
          strokes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scores_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_requests: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          round_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          round_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          round_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_requests_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_batches: {
        Row: {
          closed_at: string | null
          created_at: string | null
          created_by: string
          crew_id: string
          id: string
          status: Database["public"]["Enums"]["settle_status"]
          trip_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          created_by: string
          crew_id: string
          id?: string
          status?: Database["public"]["Enums"]["settle_status"]
          trip_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string
          crew_id?: string
          id?: string
          status?: Database["public"]["Enums"]["settle_status"]
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_cents: number
          batch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          external_ref: string | null
          from_profile: string
          id: string
          method: Database["public"]["Enums"]["settle_method"] | null
          status: Database["public"]["Enums"]["settle_status"]
          to_profile: string
        }
        Insert: {
          amount_cents: number
          batch_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          external_ref?: string | null
          from_profile: string
          id?: string
          method?: Database["public"]["Enums"]["settle_method"] | null
          status?: Database["public"]["Enums"]["settle_status"]
          to_profile: string
        }
        Update: {
          amount_cents?: number
          batch_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          external_ref?: string | null
          from_profile?: string
          id?: string
          method?: Database["public"]["Enums"]["settle_method"] | null
          status?: Database["public"]["Enums"]["settle_status"]
          to_profile?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "settlement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tees: {
        Row: {
          course_id: string
          created_at: string | null
          gender: string | null
          id: string
          name: string
          par: number
          rating: number | null
          slope: number | null
          yardage: number | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          gender?: string | null
          id?: string
          name: string
          par: number
          rating?: number | null
          slope?: number | null
          yardage?: number | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          gender?: string | null
          id?: string
          name?: string
          par?: number
          rating?: number | null
          slope?: number | null
          yardage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tees_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expense_shares: {
        Row: {
          amount_cents: number
          expense_id: string
          trip_member_id: string
        }
        Insert: {
          amount_cents: number
          expense_id: string
          trip_member_id: string
        }
        Update: {
          amount_cents?: number
          expense_id?: string
          trip_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "trip_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_shares_trip_member_id_fkey"
            columns: ["trip_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expenses: {
        Row: {
          amount_cents: number
          created_at: string | null
          description: string
          id: string
          paid_by: string
          receipt_url: string | null
          room_id: string | null
          trip_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          description: string
          id?: string
          paid_by: string
          receipt_url?: string | null
          room_id?: string | null
          trip_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          description?: string
          id?: string
          paid_by?: string
          receipt_url?: string | null
          room_id?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          arrives_at: string | null
          created_at: string | null
          departs_at: string | null
          guest_id: string | null
          id: string
          profile_id: string | null
          room_id: string | null
          status: Database["public"]["Enums"]["member_status"]
          trip_id: string
        }
        Insert: {
          arrives_at?: string | null
          created_at?: string | null
          departs_at?: string | null
          guest_id?: string | null
          id?: string
          profile_id?: string | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          trip_id: string
        }
        Update: {
          arrives_at?: string | null
          created_at?: string | null
          departs_at?: string | null
          guest_id?: string | null
          id?: string
          profile_id?: string | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crew_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          crew_id: string
          destination: string | null
          end_date: string
          id: string
          invite_code: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id: string
          destination?: string | null
          end_date: string
          id?: string
          invite_code: string
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["trip_status"]
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string
          destination?: string | null
          end_date?: string
          id?: string
          invite_code?: string
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["trip_status"]
        }
        Relationships: [
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crew_balances: {
        Row: {
          crew_id: string | null
          net_cents: number | null
          profile_id: string | null
        }
        Relationships: []
      }
      trip_balances: {
        Row: {
          net_cents: number | null
          profile_id: string | null
          trip_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_seat_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      can_admin_round: { Args: { target: string }; Returns: boolean }
      can_read_round: { Args: { target: string }; Returns: boolean }
      cancel_settlement_batch: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      complete_trip: {
        Args: { p_trip_id: string }
        Returns: {
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          crew_id: string
          destination: string | null
          end_date: string
          id: string
          invite_code: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_settlement: {
        Args: {
          p_method: Database["public"]["Enums"]["settle_method"]
          p_settlement_id: string
        }
        Returns: undefined
      }
      create_crew: {
        Args: { p_invite_code: string; p_name: string }
        Returns: string
      }
      create_manual_course: {
        Args: {
          p_city?: string
          p_holes: Json
          p_name: string
          p_rating?: number
          p_slope?: number
          p_state?: string
          p_tee_name?: string
        }
        Returns: string
      }
      create_room: {
        Args: {
          p_capacity: number
          p_cost_cents?: number
          p_name: string
          p_paid_by?: string
          p_trip_id: string
        }
        Returns: {
          capacity: number
          cost_cents: number
          id: string
          name: string
          paid_by: string | null
          trip_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crew_preview: {
        Args: { p_code: string }
        Returns: {
          crew_id: string
          member_count: number
          name: string
        }[]
      }
      delete_account: { Args: { p_profile_id?: string }; Returns: undefined }
      dispatch_push: { Args: never; Returns: undefined }
      enqueue_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_profile: string
          p_send_after?: string
          p_title: string
        }
        Returns: undefined
      }
      is_crew_admin: { Args: { target: string }; Returns: boolean }
      is_crew_member: { Args: { target: string }; Returns: boolean }
      is_trip_admin: { Args: { target: string }; Returns: boolean }
      is_trip_member: { Args: { target: string }; Returns: boolean }
      join_crew_by_code: { Args: { p_code: string }; Returns: string }
      join_trip_by_code: { Args: { p_code: string }; Returns: string }
      notification_enabled: {
        Args: {
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_profile: string
        }
        Returns: boolean
      }
      open_settlement_batch: {
        Args: { p_crew_id: string; p_payments: Json; p_trip_id?: string }
        Returns: string
      }
      queue_round_reminders: { Args: never; Returns: undefined }
      request_open_seat: { Args: { p_round_id: string }; Returns: string }
      set_green_point: {
        Args: {
          p_course_id: string
          p_hole: number
          p_lat: number
          p_lng: number
        }
        Returns: {
          course_id: string
          external_ref: string | null
          green_back_lat: number | null
          green_back_lng: number | null
          green_front_lat: number | null
          green_front_lng: number | null
          green_lat: number
          green_lng: number
          hole_number: number
          id: string
          source: string
          tee_lat: number | null
          tee_lng: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "hole_points"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_push_dispatch_secret: { Args: { p_secret: string }; Returns: string }
      split_expense_evenly: {
        Args: { p_expense_id: string; p_member_ids: string[] }
        Returns: undefined
      }
      storyline_count: { Args: { p_round_id: string }; Returns: number }
      sync_room_expense: { Args: { p_room_id: string }; Returns: undefined }
      update_hole_card: {
        Args: { p_holes: Json; p_tee_id: string }
        Returns: undefined
      }
      upsert_score: {
        Args: {
          p_base_version: number
          p_client_id: string
          p_client_updated_at: string
          p_hole_number: number
          p_penalties: number
          p_putts: number
          p_round_player_id: string
          p_strokes: number
        }
        Returns: {
          client_id: string
          client_updated_at: string
          hole_number: number
          id: string
          penalties: number | null
          putts: number | null
          round_player_id: string
          strokes: number | null
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      visible_open_seats: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["open_seat"][]
        SetofOptions: {
          from: "*"
          to: "open_seat"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      crew_role: "owner" | "admin" | "member"
      game_type:
        | "nassau"
        | "skins"
        | "match"
        | "stroke"
        | "bestball"
        | "wolf"
        | "stableford"
      handicap_source: "self" | "ghin" | "computed"
      ledger_source: "game" | "trip_expense" | "manual" | "adjustment"
      ledger_status: "open" | "settled" | "void"
      member_status: "invited" | "in" | "out" | "maybe"
      notification_kind:
        | "crew_invite"
        | "round_invite"
        | "trip_invite"
        | "rsvp_nudge"
        | "round_starting"
        | "seat_requested"
        | "seat_approved"
        | "scores_entered"
        | "round_completed"
        | "settlement_requested"
        | "settlement_confirmed"
        | "trip_updated"
        | "message"
      round_status:
        | "draft"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      round_visibility: "crew" | "friends_of_friends"
      rsvp_status: "invited" | "in" | "out" | "maybe"
      settle_method: "venmo" | "cashapp" | "cash" | "other"
      settle_status: "draft" | "requested" | "confirmed" | "cancelled"
      trip_status:
        | "planning"
        | "confirmed"
        | "active"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      open_seat: {
        round_id: string | null
        course_name: string | null
        scheduled_at: string | null
        timezone: string | null
        open_seats: number | null
        host_crew_name: string | null
        vouch_profile_id: string | null
        vouch_display_name: string | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      crew_role: ["owner", "admin", "member"],
      game_type: [
        "nassau",
        "skins",
        "match",
        "stroke",
        "bestball",
        "wolf",
        "stableford",
      ],
      handicap_source: ["self", "ghin", "computed"],
      ledger_source: ["game", "trip_expense", "manual", "adjustment"],
      ledger_status: ["open", "settled", "void"],
      member_status: ["invited", "in", "out", "maybe"],
      notification_kind: [
        "crew_invite",
        "round_invite",
        "trip_invite",
        "rsvp_nudge",
        "round_starting",
        "seat_requested",
        "seat_approved",
        "scores_entered",
        "round_completed",
        "settlement_requested",
        "settlement_confirmed",
        "trip_updated",
        "message",
      ],
      round_status: [
        "draft",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      round_visibility: ["crew", "friends_of_friends"],
      rsvp_status: ["invited", "in", "out", "maybe"],
      settle_method: ["venmo", "cashapp", "cash", "other"],
      settle_status: ["draft", "requested", "confirmed", "cancelled"],
      trip_status: [
        "planning",
        "confirmed",
        "active",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
