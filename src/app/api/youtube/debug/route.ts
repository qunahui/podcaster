// src/app/api/youtube/debug/route.ts
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { NextResponse } from 'next/server';

const DEBUG_PREFIX = '🔍 [DEBUG-API]';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get('videoId');

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const youtubeId = getYoutubeId(videoUrl);
    if (!youtubeId) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    // Fetch video and all segments
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: {
        segments: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Count processed segments
    const processedSegments = video.segments.filter((s) => s.isProcessed);

    // Check audio URLs
    const segmentChecks = await Promise.all(
      processedSegments.map(async (segment) => {
        let urlStatus = 'Unknown';
        let urlError = null;

        try {
          // Quick HEAD request to check if URL is valid
          if (segment.url) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            try {
              const response = await fetch(segment.url, {
                method: 'HEAD',
                signal: controller.signal,
              });

              clearTimeout(timeoutId);
              urlStatus = response.ok ? 'OK' : `Error: ${response.status}`;
            } catch (error) {
              clearTimeout(timeoutId);
              urlStatus = 'Error';
              urlError =
                error instanceof Error ? error.message : 'Unknown error';
            }
          } else {
            urlStatus = 'Missing URL';
          }
        } catch (error) {
          urlStatus = 'Check Failed';
          urlError = error instanceof Error ? error.message : 'Unknown error';
        }

        return {
          id: segment.id,
          startTime: segment.startTime,
          endTime: segment.endTime,
          isProcessed: segment.isProcessed,
          url: segment.url,
          urlStatus,
          urlError,
        };
      })
    );

    // Generate a simple HTML page with debug info and direct links
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Audio Debug</title>
        <style>
          body { font-family: sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .status-ok { color: green; }
          .status-error { color: red; }
          .direct-link { margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Audio Debug for YouTube ID: ${youtubeId}</h1>
        <div>
          <p>Video ID: ${video.id}</p>
          <p>Total segments: ${video.segments.length}</p>
          <p>Processed segments: ${processedSegments.length}</p>
        </div>
        
        <h2>Segments</h2>
        <table>
          <tr>
            <th>ID</th>
            <th>Time</th>
            <th>Processed</th>
            <th>URL</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
          ${segmentChecks
            .map(
              (segment) => `
            <tr>
              <td>${segment.id}</td>
              <td>${segment.startTime.toFixed(1)}s - ${segment.endTime.toFixed(1)}s</td>
              <td>${segment.isProcessed ? 'Yes' : 'No'}</td>
              <td>${segment.url ? segment.url.substring(0, 50) + '...' : 'None'}</td>
              <td class="${segment.urlStatus === 'OK' ? 'status-ok' : 'status-error'}">${segment.urlStatus}</td>
              <td>
                ${
                  segment.isProcessed
                    ? `
                  <a href="/api/youtube/audio-proxy?segmentId=${segment.id}" target="_blank">Play via Proxy</a>
                  ${segment.url ? `<br><a href="${segment.url}" target="_blank">Direct URL</a>` : ''}
                `
                    : 'Not processed yet'
                }
              </td>
            </tr>
          `
            )
            .join('')}
        </table>
        
        <div class="direct-link">
          <h2>HLS Playlist</h2>
          <p><a href="/api/youtube/playlist?videoId=${videoUrl}&debug=true" target="_blank">View HLS Playlist</a></p>
        </div>
        
        <div class="direct-link">
          <h2>Audio Player</h2>
          <p>First segment direct play:</p>
          ${
            processedSegments.length > 0
              ? `
            <audio controls src="/api/youtube/audio-proxy?segmentId=${processedSegments[0].id}"></audio>
          `
              : 'No processed segments available'
          }
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
