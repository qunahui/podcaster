import { NextResponse } from 'next/server';
import { processTranscripts } from '@/lib/deepseek';

export async function POST(request: Request) {
  try {
    const requestData = await request.json();

    if (!requestData?.transcripts) {
      return NextResponse.json(
        { error: 'transcripts array not provided' },
        { status: 400 }
      );
    }

    const result = await processTranscripts(requestData.transcripts);

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export const runtime = 'edge';
