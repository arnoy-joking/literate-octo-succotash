export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query parameter ?q=" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  try {
    // Fixed the YouTube URL here
    const ytURL = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    const ytRes = await fetch(ytURL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html"
      }
    });

    const html = await ytRes.text();
    const videos = extractVideos(html);

    return new Response(JSON.stringify({
      query: query,
      results: videos,
      count: videos.length
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
}

function extractVideos(html) {
  let jsonText = null;
  const scripts = html.match(/<script[^>]*>.*?ytInitialData.*?<\/script>/gs);
  if (scripts) {
    for (const s of scripts) {
      const m = s.match(/ytInitialData\s*=\s*(\{.*?\});/s);
      if (m) { jsonText = m[1]; break; }
    }
  }
  if (!jsonText) {
    const fallbackMatch = html.match(/var ytInitialData\s*=\s*(\{.*?\});<\/script>/s);
    if (fallbackMatch) jsonText = fallbackMatch[1];
  }

  if (!jsonText) return [];

  try {
    const data = JSON.parse(jsonText);
    const results = [];
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    for (let item of contents) {
      const vid = item.videoRenderer;
      if (!vid) continue;

      results.push({
        videoId: vid.videoId,
        title: vid.title?.runs?.[0]?.text || "",
        channel: vid.ownerText?.runs?.[0]?.text || "",
        duration: vid.lengthText?.simpleText || "",
        views: vid.viewCountText?.simpleText || "",
        thumbnail: vid.thumbnail?.thumbnails?.pop()?.url || ""
      });
    }
    return results;
  } catch (e) {
    return [];
  }
}
