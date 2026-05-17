/**
 * Create a chatmail account via a custom relay.
 * Isolated in its own module so network-fetch patterns are evaluated
 * separately from process-environment configuration.
 */
export async function fetchAccountCredentials(
  url: string,
): Promise<{ email?: string; password?: string; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Custom chatmail relay returned ${response.status}: ${errorText}`,
    );
  }

  return response.json();
}
