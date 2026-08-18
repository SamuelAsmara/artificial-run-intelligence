/**
 * Types matching supabase/migrations/0001_init.sql (v1: athlete + coach).
 * Regenerate from the live schema when possible:
 *   npx supabase gen types typescript --project-id gmhazouoxurtxtlahfjl > src/types/database.types.ts
 */

export type Role = "athlete" | "coach";
export type RaceType = "5k" | "10k" | "half" | "full";
export type Level = "beginner" | "experienced";
export type GoalRaceStatus = "active" | "cancelled" | "completed";
export type PlanStatus = "active" | "completed" | "cancelled";
export type WorkoutType = "easy" | "interval" | "long" | "rest";
export type WorkoutStatus = "planned" | "completed" | "missed" | "adjusted";
export type RecoverySource = "webhook" | "derived";
export type CoachLinkStatus = "invited" | "active";
export type Plan = "free" | "pro";

type Row<T> = T;
type Ins<T> = T;
type Upd<T> = Partial<T>;

/** Data sources the athlete connects themselves (no OAuth flow available). */
/** Where an activity came from. See migration 0004_activity_sources. */
/** Physiological fields added in migration 0002_profile_physiology. */
export type Sex = "male" | "female";
export type RunningLevel = "beginner" | "intermediate" | "advanced";

export type ActivitySource = "strava" | "intervals_icu" | "manual";

export type ProviderId = "intervals_icu";
export type ProviderStatus = "connected" | "error" | "revoked";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; role: Role; created_at: string; full_name: string | null; age: number | null; sex: Sex | null; height_cm: number | null; weight_kg: number | null; running_level: RunningLevel | null; bio: string | null; hr_max: number | null; lthr: number | null; threshold_speed_mps: number | null; thresholds_measured: boolean; thresholds_updated_at: string | null; avatar_url: string | null; avatar_position: string };
        Insert: { id: string; email: string; role?: Role; created_at?: string; full_name?: string | null; age?: number | null; sex?: Sex | null; height_cm?: number | null; weight_kg?: number | null; running_level?: RunningLevel | null; bio?: string | null; hr_max?: number | null; lthr?: number | null; threshold_speed_mps?: number | null; thresholds_measured?: boolean; thresholds_updated_at?: string | null; avatar_url?: string | null; avatar_position?: string };
        Update: Upd<{ id: string; email: string; role: Role; created_at: string; full_name: string | null; age: number | null; sex: Sex | null; height_cm: number | null; weight_kg: number | null; running_level: RunningLevel | null; bio: string | null; hr_max: number | null; lthr: number | null; threshold_speed_mps: number | null; thresholds_measured: boolean; thresholds_updated_at: string | null; avatar_url: string | null; avatar_position: string }>;
        Relationships: [];
      };
      coach_athletes: {
        Row: { id: string; coach_id: string; athlete_id: string; status: CoachLinkStatus; created_at: string };
        Insert: { id?: string; coach_id: string; athlete_id: string; status?: CoachLinkStatus; created_at?: string };
        Update: Upd<{ id: string; coach_id: string; athlete_id: string; status: CoachLinkStatus; created_at: string }>;
        Relationships: [];
      };
      subscriptions: {
        Row: { user_id: string; plan: Plan; seat_limit: number; updated_at: string };
        Insert: { user_id: string; plan?: Plan; seat_limit?: number; updated_at?: string };
        Update: Upd<{ user_id: string; plan: Plan; seat_limit: number; updated_at: string }>;
        Relationships: [];
      };
      billing_events: {
        Row: { id: string; user_id: string; plan_from: string | null; plan_to: string | null; seats: number | null; created_at: string };
        Insert: { id?: string; user_id: string; plan_from?: string | null; plan_to?: string | null; seats?: number | null; created_at?: string };
        Update: Upd<{ id: string; user_id: string; plan_from: string | null; plan_to: string | null; seats: number | null; created_at: string }>;
        Relationships: [];
      };
      strava_connections: {
        Row: { user_id: string; access_token: string; refresh_token: string; expires_at: string; athlete_id: number | null; last_sync_at: string | null; last_sync_status: string | null };
        Insert: { user_id: string; access_token: string; refresh_token: string; expires_at: string; athlete_id?: number | null; last_sync_at?: string | null; last_sync_status?: string | null };
        Update: Upd<{ user_id: string; access_token: string; refresh_token: string; expires_at: string; athlete_id: number | null; last_sync_at: string | null; last_sync_status: string | null }>;
        Relationships: [];
      };
      plan_templates: {
        Row: { id: string; race_type: RaceType; level: Level; weeks: number; phase_structure: Record<string, number>; weekly_mix: Record<string, number> };
        Insert: { id?: string; race_type: RaceType; level: Level; weeks: number; phase_structure: Record<string, number>; weekly_mix: Record<string, number> };
        Update: Upd<{ id: string; race_type: RaceType; level: Level; weeks: number; phase_structure: Record<string, number>; weekly_mix: Record<string, number> }>;
        Relationships: [];
      };
      goal_races: {
        Row: { id: string; user_id: string; race_type: RaceType; race_date: string; target_time: string | null; status: GoalRaceStatus; created_at: string };
        Insert: { id?: string; user_id: string; race_type: RaceType; race_date: string; target_time?: string | null; status?: GoalRaceStatus; created_at?: string };
        Update: Upd<{ id: string; user_id: string; race_type: RaceType; race_date: string; target_time: string | null; status: GoalRaceStatus; created_at: string }>;
        Relationships: [];
      };
      training_plans: {
        Row: { id: string; user_id: string; goal_race_id: string; template_id: string | null; status: PlanStatus; created_at: string };
        Insert: { id?: string; user_id: string; goal_race_id: string; template_id?: string | null; status?: PlanStatus; created_at?: string };
        Update: Upd<{ id: string; user_id: string; goal_race_id: string; template_id: string | null; status: PlanStatus; created_at: string }>;
        Relationships: [];
      };
      plan_workouts: {
        Row: { id: string; plan_id: string; week_number: number; day_date: string; workout_type: WorkoutType; planned_distance: number | null; planned_pace: string | null; status: WorkoutStatus };
        Insert: { id?: string; plan_id: string; week_number: number; day_date: string; workout_type: WorkoutType; planned_distance?: number | null; planned_pace?: string | null; status?: WorkoutStatus };
        Update: Upd<{ id: string; plan_id: string; week_number: number; day_date: string; workout_type: WorkoutType; planned_distance: number | null; planned_pace: string | null; status: WorkoutStatus }>;
        Relationships: [];
      };
      activities: {
        Row: { id: string; user_id: string; source: ActivitySource; external_id: string; strava_activity_id: number | null; type: string | null; distance_m: number | null; duration_s: number | null; avg_hr: number | null; avg_pace: string | null; started_at: string | null; pace_shape: (number | null)[] | null; best_efforts: Record<string, number> | null; cardiac_drift_pct: number | null; streams_fetched_at: string | null };
        Insert: { id?: string; user_id: string; source?: ActivitySource; external_id: string; strava_activity_id?: number | null; type?: string | null; distance_m?: number | null; duration_s?: number | null; avg_hr?: number | null; avg_pace?: string | null; started_at?: string | null; pace_shape?: (number | null)[] | null; best_efforts?: Record<string, number> | null; cardiac_drift_pct?: number | null; streams_fetched_at?: string | null };
        Update: Upd<{ id: string; user_id: string; source: ActivitySource; external_id: string; strava_activity_id: number | null; type: string | null; distance_m: number | null; duration_s: number | null; avg_hr: number | null; avg_pace: string | null; started_at: string | null; pace_shape: (number | null)[] | null; best_efforts: Record<string, number> | null; cardiac_drift_pct: number | null; streams_fetched_at: string | null }>;
        Relationships: [];
      };
      readiness_snapshots: {
        Row: { id: string; user_id: string; date: string; ctl: number | null; atl: number | null; tsb: number | null; acwr: number | null; cardiac_drift: number | null; readiness_score: number | null; narrative: string | null };
        Insert: { id?: string; user_id: string; date: string; ctl?: number | null; atl?: number | null; tsb?: number | null; acwr?: number | null; cardiac_drift?: number | null; readiness_score?: number | null; narrative?: string | null };
        Update: Upd<{ id: string; user_id: string; date: string; ctl: number | null; atl: number | null; tsb: number | null; acwr: number | null; cardiac_drift: number | null; readiness_score: number | null; narrative: string | null }>;
        Relationships: [];
      };
      plan_adjustments: {
        Row: { id: string; plan_id: string; workout_id: string | null; changed_at: string; reason_code: string | null; reason_text: string | null; before: unknown; after: unknown };
        Insert: { id?: string; plan_id: string; workout_id?: string | null; changed_at?: string; reason_code?: string | null; reason_text?: string | null; before?: unknown; after?: unknown };
        Update: Upd<{ id: string; plan_id: string; workout_id: string | null; changed_at: string; reason_code: string | null; reason_text: string | null; before: unknown; after: unknown }>;
        Relationships: [];
      };
      provider_connections: {
        Row: { id: string; user_id: string; provider: ProviderId; external_id: string; api_key: string; api_key_hint: string | null; status: ProviderStatus; last_error: string | null; last_synced_at: string | null; connected_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; provider: ProviderId; external_id: string; api_key: string; api_key_hint?: string | null; status?: ProviderStatus; last_error?: string | null; last_synced_at?: string | null; connected_at?: string; updated_at?: string };
        Update: Upd<{ id: string; user_id: string; provider: ProviderId; external_id: string; api_key: string; api_key_hint: string | null; status: ProviderStatus; last_error: string | null; last_synced_at: string | null; connected_at: string; updated_at: string }>;
        Relationships: [];
      };
      recovery_signals: {
        Row: { id: string; user_id: string; date: string; source: RecoverySource; sleep_hours: number | null; resting_hr: number | null; hrv: number | null };
        Insert: { id?: string; user_id: string; date: string; source: RecoverySource; sleep_hours?: number | null; resting_hr?: number | null; hrv?: number | null };
        Update: Upd<{ id: string; user_id: string; date: string; source: RecoverySource; sleep_hours: number | null; resting_hr: number | null; hrv: number | null }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
