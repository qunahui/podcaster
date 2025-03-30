import { makePublicityGoogleCloudURL } from '@/utils/getPublicictyURL';

export const translateTranscript = async (
  transcripts: string
): Promise<string> => {
  try {
    // Add retry logic for more reliability
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(
          'https://asia-northeast1-starry-compiler-439208-m6.cloudfunctions.net/preprocess_transcript_function',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              transcripts,
              source_language: 'en',
              target_language: 'vi',
            }),
            // Add timeout
            signal: AbortSignal.timeout(10000), // 10 second timeout
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        return data.processed_transcript;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        lastError = error;

        // If this isn't our last attempt, wait before retrying with exponential backoff
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
          );
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error('Error translating transcript:', error);
    throw error;
  }
};

/**
 * Synthesize a segment of text to speech and get the audio URL
 */
export const synthesize_segment = async (
  text: string,
  segmentId: string
): Promise<string> => {
  try {
    console.log('Synthesizing text:', text);
    console.log('Segment ID:', segmentId);

    // Add retry logic
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await fetch(
          'https://asia-northeast1-starry-compiler-439208-m6.cloudfunctions.net/synthesize_speech_function',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: text,
              audio_name: segmentId,
              voice_name: 'vi-VN-Standard-A', // Vietnamese voice
              speaking_rate: 1.0, // Normal speed
              pitch: 0.0, // Normal pitch
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        // Log the full response for debugging
        const responseText = await response.text();
        console.log(`Attempt ${attempt} response:`, {
          status: response.status,
          statusText: response.statusText,
          body: responseText,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} - ${responseText}`);
        }

        // Try to parse the response as JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          throw new Error(`Invalid JSON response: ${responseText}`);
        }

        if (!data?.audio_url) {
          throw new Error('No audio_url found in the response');
        }

        // Safely convert to public URL - handle both gs:// URLs and direct URLs
        try {
          return makePublicityGoogleCloudURL(data.audio_url);
        } catch (error) {
          // If URL conversion fails, use the URL directly if it looks like an HTTP URL
          if (data.audio_url.startsWith('http')) {
            return data.audio_url;
          }

          // If it's not an HTTP URL and not a valid GCS URL, throw the error
          throw error;
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        lastError = error;

        // If this isn't our last attempt, wait before retrying with exponential backoff
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
          );
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error('Error synthesizing segment:', error);
    throw error;
  }
};
