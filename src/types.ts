export interface TaskRow {
  id: string;
  assigned_to: string;
  status: string;
  payload: string;
  result: string | null;
  qa_status: string;
  qa_report: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentLogRow {
  id: number;
  task_id: string | null;
  agent_name: string;
  log_level: string;
  message: string;
}
