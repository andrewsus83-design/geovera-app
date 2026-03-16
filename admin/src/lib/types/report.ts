export interface BiweeklyReport {
  id: string;
  brand_id: string;
  report_id: string;
  period_start: string;
  period_end: string;
  tier: string | null;
  geo_start: number | null;
  geo_end: number | null;
  geo_delta: number | null;
  momentum: string | null;
  report_data: Record<string, unknown> | null;
  report_type: 'onboarding' | 'auto' | 'manual';
  wa_sent: boolean;
  generated_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  brand_id: string;
  insight_id: string | null;
  persona_id: string | null;
  persona_icon: string | null;
  persona_label: string | null;
  priority: string | null;
  action_text: string | null;
  odrip: Record<string, unknown> | null;
  short_code: string;
  status: string | null;
  priority_score: number | null;
  wa_sent: boolean;
  wa_sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Insight {
  id: string;
  brand_id: string;
  insight_text: string | null;
  pillar: string | null;
  confidence: number | null;
  cycle_id: string | null;
  persona_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthScore {
  brand_id: string;
  score: number | null;
  grade: string | null;
  created_at: string;
}

export interface GeoScore {
  id: string;
  brand_id: string;
  score: number | null;
  recorded_at: string;
}
