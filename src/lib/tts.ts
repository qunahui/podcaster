export const translateTranscript = async (transcripts: string) => {
  try {
    const response = await fetch(
      'https://asia-northeast1-starry-compiler-439208-m6.cloudfunctions.net/preprocess_transcript_function',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcripts }),
      }
    );

    const data = await response.json();
    return data.processed_transcript;
  } catch (error) {
    console.error('Error translating transcript:', error);
    throw error;
  }
};

export const synthesize_segment = async (text: string, segmentid: string) => {
  try {
    console.log('Synthesizing text:', text);
    console.log('Segment ID:', segmentid);

    // Add retry logic
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(
          'https://asia-northeast1-starry-compiler-439208-m6.cloudfunctions.net/synthesize_speech_function',
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              // Add authentication if needed:
              // 'Authorization': `Bearer ${process.env.CLOUD_FUNCTION_KEY}`,
            },
            body: JSON.stringify({
              text: text,
              audio_name: segmentid,
            }),
          }
        );

        // Log the full response for debugging
        const responseText = await response.text();
        console.log(`Attempt ${attempt} response:`, {
          status: response.status,
          statusText: response.statusText,
          body: responseText
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

        return data.audio_url;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        lastError = error;
        
        // If this isn't our last attempt, wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error('Error synthesize segment:', error);
    throw error;
  }
};
