export interface DeepseekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepseekChatRequest {
  model: string;
  messages: DeepseekMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface DeepseekChoice {
  index: number;
  message: DeepseekMessage;
  finish_reason: string;
}

export interface DeepseekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface DeepseekChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepseekChoice[];
  usage: DeepseekUsage;
}