import fetch from 'node-fetch';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await fetch(url); // Removed invalid 'timeout' property
    const html = await res.text();
    const title = html.match(/<title>(.*?)<\/title>/i)?.[1];
    const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
      || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1];
    const image = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)?.[1];
    return {
      url,
      ...(title !== undefined ? { title } : {}),
      ...(desc !== undefined ? { description: desc } : {}),
      ...(image !== undefined ? { image } : {})
    }; // All properties are optional in LinkPreview
  } catch (err) {
    return null;
  }
}
