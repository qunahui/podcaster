import type { NextApiRequest, NextApiResponse } from 'next';
import {
  appendToSegmentTable,
  findVideoByYoutubeId,
  SegmentRecord,
} from '../../../lib/database';

const globalSegmentId = 1;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { videoId, audioUrl, startTime } = req.body;

  if (!videoId || !audioUrl || typeof startTime !== 'number') {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 1) Check if the video exists
  const videoRecord = findVideoByYoutubeId(videoId);
  if (!videoRecord) {
    return res.status(404).json({ error: 'Video not found' });
  }

  try {
    // 2) Call /api/youtube/audio-length to measure the MP3
    const response = await fetch(
      'http://localhost:3000/api/youtube/audio-length',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.error || 'audio-length request failed');
    }

    const { duration } = await response.json();

    // 3) Create a new SegmentRecord
    const newSegment: SegmentRecord = {
      videoId: videoRecord.id,
      startTime,
      endTime: startTime + duration,
      url: audioUrl,
    };

    // 4) Append to segment table in db.json
    appendToSegmentTable(newSegment);

    // 5) Return the created segment data
    return res.status(201).json({
      message: 'Segment created',
      segment: newSegment,
    });
  } catch (error: any) {
    console.error('Error generating segment:', error);
    return res.status(500).json({
      error: 'Failed to generate segment',
      details: error.message,
    });
  }
}
