import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { videoId: url, timestamp } = body;

    if (!url || typeof timestamp !== 'number') {
      return NextResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    const youtubeId = getYoutubeId(url);
    
    // Find the video and its processed segments
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: {
        segments: {
          where: { isProcessed: true },
          orderBy: { startTime: 'asc' }
        }
      }
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Return all available segments
    const segments = video.segments.map(segment => ({
      start: segment.startTime,
      end: segment.endTime,
      url: segment.url
    }));

    return NextResponse.json({ segments });
  } catch (error) {
    console.error('Error checking available segments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 