import { NextResponse } from 'next/server';

const DEBUG_PREFIX = '🎵 [AUDIO-PROXY]';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const audioUrl = url.searchParams.get('url');

    if (!audioUrl) {
      console.error(`${DEBUG_PREFIX} No audio URL provided`);
      return new NextResponse('Audio URL is required', { status: 400 });
    }

    console.log(`${DEBUG_PREFIX} Proxying request for:`, audioUrl);

    const response = await fetch(audioUrl);
    
    if (!response.ok) {
      console.error(`${DEBUG_PREFIX} Failed to fetch audio:`, {
        status: response.status,
        statusText: response.statusText
      });
      return new NextResponse('Failed to fetch audio', { status: response.status });
    }

    // Get the audio data as an array buffer
    const audioData = await response.arrayBuffer();

    // Forward the response with appropriate headers
    return new NextResponse(audioData, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.byteLength.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error proxying audio:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 