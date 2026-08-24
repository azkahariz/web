export type StationCompletionStatus =
  | "PERLU_PERHATIAN"
  | "BELUM_DIMULAI"
  | "TERISI_SEBAGIAN"
  | "LENGKAP";

export type StationCompletionRowStatus =
  | StationCompletionStatus
  | "KOSONG"
  | "GUDANG_TERSEDIA";

export type StationCompletionIssue = {
  code: string;
  label: string;
};

export type MissingCompletionCategory = {
  id: string;
  label: string;
};

export type StationCompletionSummary = {
  station_id: string;
  station_name: string;
  site_count: number;
  expected_submission_count: number;
  existing_submission_count: number;
  complete_submission_count: number;
  partial_submission_count: number;
  empty_submission_count: number;
  not_started_count: number;
  expected_attention_count: number;
  unexpected_submission_count: number;
  attention_count: number;
  expected_category_count: number;
  filled_category_count: number;
  category_progress: number | null;
  warehouse_expected_count: number;
  warehouse_existing_count: number;
  warehouse_category_count: number;
  warehouse_unit_count: number;
  pending_qc_count: number;
  content_last_updated: string | null;
  station_status: StationCompletionStatus;
  issues: StationCompletionIssue[];
};

export type StationCompletionDetailRow = {
  site_id: string | null;
  site_name: string | null;
  site_type_id: string | null;
  site_type_name: string | null;
  site_subtype_id: string | null;
  subtype_name: string | null;
  profile_id: string | null;
  is_expected: boolean;
  is_warehouse: boolean;
  active_submission_count: number;
  submission_id: string | null;
  submission_version: number | null;
  status: StationCompletionRowStatus;
  expected_category_count: number;
  filled_category_count: number;
  missing_categories: MissingCompletionCategory[];
  warehouse_category_count: number;
  warehouse_unit_count: number;
  pending_qc_count: number;
  content_last_saved_at: string | null;
  issues: StationCompletionIssue[];
};

export type StationCompletionSummaryResponse = {
  rows: StationCompletionSummary[];
};

export type StationCompletionDetailResponse = {
  station_id: string;
  station_name: string;
  summary: StationCompletionSummary;
  rows: StationCompletionDetailRow[];
};
