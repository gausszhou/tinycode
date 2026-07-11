const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT = 20_000;

function isPrivateIP(host: string): boolean {
  const ipm = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipm) {
    const a = +ipm[1], b = +ipm[2];
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
      return true;
  }
  return false;
}

export const web_fetch = {
  description:
    "Fetch HTTP/HTTPS URL content. Blocks localhost/internal IPs (SSRF protection). Default returns plain text. Max 50000 chars",
  parameters: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description:
          "URL to fetch (http/https). Auto-follows redirects",
      },
      format: {
        type: "string",
        enum: ["text", "html", "json"],
        description:
          "text=plain text (strip HTML), html=raw HTML, json=pretty-print JSON. Default text",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const urlStr = args.url as string;
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return `web_fetch failed: Invalid URL - ${(e as Error).message}`;
    }

    const proto = parsed.protocol;
    if (proto !== "http:" && proto !== "https:")
      return `web_fetch failed: Unsupported protocol "${proto}"`;

    const host = parsed.hostname.toLowerCase();
    if (
      ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)
    )
      return "web_fetch failed: Cannot access localhost";
    if (isPrivateIP(host))
      return "web_fetch failed: Cannot access private/reserved IP";

    const doFetch = async (
      url: string,
      redirectsLeft: number,
    ): Promise<string> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "tinycode/1.0" },
          signal: controller.signal,
          redirect: "manual",
        });

        if (
          [301, 302, 303, 307, 308].includes(res.status) &&
          redirectsLeft > 0
        ) {
          const loc = res.headers.get("location");
          if (!loc)
            return `web_fetch failed: ${res.status} missing Location header`;
          return doFetch(new URL(loc, url).href, redirectsLeft - 1);
        }

        let body = await res.text();
        let truncated = false;
        if (body.length > 50000) {
          body = body.slice(0, 50000);
          truncated = true;
        }

        let output = body;
        const format = (args.format as string) || "text";
        if (format === "json") {
          try {
            output = JSON.stringify(JSON.parse(body), null, 2);
          } catch {
            output = body;
          }
        } else if (format === "text") {
          output = body
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, " ")
            .replace(/\n{3,}/g, "\n\n");
        }

        const suffix = truncated
          ? "\n...[response truncated to 50000 chars]"
          : "";
        return `HTTP ${res.status} ${url}\n\n${output}${suffix}`;
      } catch (e) {
        if ((e as Error).name === "AbortError")
          return "web_fetch failed: Request timeout (20s)";
        return `web_fetch failed: ${(e as Error).message}`;
      } finally {
        clearTimeout(timeout);
      }
    };

    return doFetch(parsed.href, MAX_REDIRECTS);
  },
};
