/**
 * Converts a gs:// URL to its public https://storage.googleapis.com/<bucket>/<object> form.
 *
 * e.g.,
 *  "gs://podcaster_storage_1/1.mp3"
 *     => "https://storage.googleapis.com/podcaster_storage_1/1.mp3"
 */
export const makePublicityGoogleCloudURL = (gsURL: string): string => {
    if (!gsURL.startsWith('gs://')) {
      throw new Error('Invalid Google Cloud Storage URL (must start with "gs://")');
    }
  
    // Remove the "gs://" prefix to isolate the bucket/object path
    const path = gsURL.slice(5); // e.g. "podcaster_storage_1/1.mp3"
  
    // Combine with the well-known GCS public URL domain
    return `https://storage.googleapis.com/${path}`;
  };
  