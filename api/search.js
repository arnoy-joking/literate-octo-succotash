export const config = {
  runtime: 'edge', // Edge runtime ব্যবহার করলে পারফরম্যান্স ভালো হবে
};

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing search query parameter ?q=" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  try {
    const ytURL = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);

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
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Failed to fetch or parse YouTube search results",
      details: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
}

// YouTube parsing logic (একই থাকছে)
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

      const thumbnails = vid.thumbnail?.thumbnails || [];
      const bestThumbnail = thumbnails[thumbnails.length - 1] || thumbnails[0];
      const durationText = vid.lengthText?.simpleText || vid.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText || "";
      const channelId = vid.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";

      results.push({
        videoId: vid.videoId,
        title: vid.title?.runs?.[0]?.text || vid.title?.simpleText || "",
        channel: vid.ownerText?.runs?.[0]?.text || vid.shortBylineText?.runs?.[0]?.text || "",
        channelId: channelId,
        views: vid.viewCountText?.simpleText || "",
        published: vid.publishedTimeText?.simpleText || "",
        duration: durationText,
        thumbnail: bestThumbnail?.url || "",
        isLive: vid.thumbnailOverlays?.[1]?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE",
        description: vid.descriptionSnippet?.runs?.map(run => run.text).join('') || ""
      });
    }
    return results;
  } catch (e) {
    return [];
  }
}
