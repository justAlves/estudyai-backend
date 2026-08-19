import { officialUrl, sourceFrom } from "./source";

export function pdfLinks(html: string, pageUrl: URL, source: ReturnType<typeof sourceFrom>) {
  const links = new Map<string, string>();

  if (source === "ibfc") {
    const items = html.matchAll(/<li class="pdf"[\s\S]*?<\/li>/gi);
    for (const item of items) {
      const label = item[0].match(/<a style=[\s\S]*?>([\s\S]*?)<span/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const href = item[0].match(/https:\/\/anexos\.cdn\.selecao\.net\.br\/[^"'\s]+\.pdf/i)?.[0];
      if (!label || !href) continue;
      try {
        links.set(officialUrl(source, href).toString(), label);
      } catch {}
    }
    return [...links].map(([url, label]) => ({ url, label }));
  }

  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);

  for (const anchor of anchors) {
    const href = anchor[1].replaceAll("&amp;", "&").trim();
    if (!/\.pdf(?:[?#]|$)/i.test(href)) continue;

    try {
      const url = officialUrl(source, new URL(href, pageUrl).toString());
      const label = anchor[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      links.set(url.toString(), label);
    } catch {
      // Files hosted outside the official domain are intentionally not collected.
    }
  }

  return [...links].map(([url, label]) => ({ url, label }));
}

export async function discoverOfficialPdfs(source: ReturnType<typeof sourceFrom>, pageUrl: URL) {
  const response = await fetch(pageUrl, { headers: { "user-agent": "EstudyAI-research-bot/1.0" } });
  if (!response.ok) throw new Error(`Não foi possível abrir a página: HTTP ${response.status}.`);
  return pdfLinks(await response.text(), pageUrl, source);
}

if (import.meta.main) {
  const [sourceValue, pageValue] = Bun.argv.slice(2);
  if (!sourceValue || !pageValue) {
    console.error("Uso: bun run collect:discover <banca> <url-da-página-oficial>");
    process.exit(1);
  }
  const source = sourceFrom(sourceValue);
  const pageUrl = officialUrl(source, pageValue);
  console.log(JSON.stringify({ source, pageUrl: pageUrl.toString(), pdfs: await discoverOfficialPdfs(source, pageUrl) }, null, 2));
}
