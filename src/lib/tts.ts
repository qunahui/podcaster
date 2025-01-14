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

    const response = await fetch(
      'https://asia-northeast1-starry-compiler-439208-m6.cloudfunctions.net/synthesize_speech_function',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          audio_name: segmentid,
        }),
      }
    );

    if (!response.ok) {
      // Not a 2xx status; read text to see the error message (likely HTML)
      const errorText = await response.text();
      console.error('Cloud Function returned error:', errorText);
      throw new Error(`Cloud Function error: HTTP ${response.status} - ${errorText}`);
    }

    // If we get here, it's a 2xx success, so parse JSON
    const data = await response.json();
    if (!data?.audio_url) {
      throw new Error('No audio_url found in the JSON response.');
    }

    return data.audio_url;
  } catch (error) {
    console.error('Error synthesize segment:', error);
    throw error;
  }
};
