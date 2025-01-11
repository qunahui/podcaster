import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing YouTube URL' },
        { status: 400 }
      );
    }

    // Extract video ID using YoutubeTranscript's retrieveVideoId method
    const videoId = YoutubeTranscript['retrieveVideoId'](url);

    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL format' },
        { status: 400 }
      );
    }

    // Fetch the transcript
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'en',
    });

    // Convert transcript to plain text
    const transcriptText = transcript.map((item) => item.text).join(' ');

    return NextResponse.json({ transcript: transcriptText }, { status: 200 });
  } catch (error) {
    console.error('Error fetching transcript:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch transcript.',
      },
      { status: 500 }
    );
  }
}
