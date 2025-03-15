import { NextResponse } from 'next/server';
import { DeepseekChatRequest, DeepseekChatResponse } from '../types/deepseek';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';

interface TranscriptRequest {
  transcripts: string[];
}

interface ProcessedResponse {
  processed_transcript: string;
}

interface ErrorResponse {
  error: string;
}

export async function callDeepseekAPI(prompt: string): Promise<string> {
  const payload: DeepseekChatRequest = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are a professional language translator.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
  };

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Deepseek API error: ${response.statusText}`);
    }

    const data: DeepseekChatResponse = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Deepseek API call failed:', error);
    throw error;
  }
}

export async function processTranscripts(transcripts: string[]): Promise<ProcessedResponse | ErrorResponse> {
  try {
    const prompt = `
      You are provided with an array of inappropriate transcript sentences below. Your job now is to concatenate and split the sentences with their corresponding positions.
      Guidelines:
      - Translate into Vietnamese. MUST NOT translate Product names, tools, software, and services, Technical acronyms, Programming languages and frameworks, Libraries and packages, Code keywords, commands, and syntax, Specialized technical terms, Protocols and technology standards, Variable and function names in code, Hardware names and technical components, Official documentation, technical standards, and specifications, Error messages, logs, and debugging information. Leave them as they are.
      - Only return the translated text. DO NOT RETURN ANYTHING ELSE.

      Transcript array:
      ${JSON.stringify(transcripts, null, 2)}
    `;

    const translatedText = await callDeepseekAPI(prompt);
    return { processed_transcript: translatedText };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}