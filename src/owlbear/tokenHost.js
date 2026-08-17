export async function publishTokenPng(file) {
  const response = await fetch("/amba-generated-tokens", {
    method: "POST",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Unable to publish token image: ${response.status}`);
  }
  const payload = await response.json();
  return new URL(payload.url, window.location.origin).href;
}