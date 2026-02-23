export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface TaskEnvelope {
  taskId: string;
  from: string;
  to: string;
  tool: string;
  payload: unknown;
  timestamp: number;
  signature: string;
}

export interface TaskResponse {
  taskId: string;
  from: string;
  result: unknown;
  timestamp: number;
  signature: string;
}
