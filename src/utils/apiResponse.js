export async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (response.status === 404) {
      throw new Error('The API route was not found. Wait for the latest deployment, then try again.');
    }
    throw new Error(fallbackMessage);
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}
