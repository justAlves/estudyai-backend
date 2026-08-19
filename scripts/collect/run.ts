import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { discoverOfficialPdfs } from "./discover";
import { importPdf, type Kind } from "./import-pdf";
import { seeds } from "./seeds";
import { officialUrl } from "./source";

const ignored = /resultado|convoca|local de prova|recurso|edital|folha de resposta|justificativa|super ampliada|ledor/i;
const MAX_EXAMS_PER_SOURCE = 12;

export function collectable(label: string, match: RegExp) {
  return match.test(label) && !ignored.test(label);
}

type ReportItem = { seed: string; url: string; status: "imported" | "cached" | "skipped" | "failed"; error?: string };

async function examCounts() {
  const counts = new Map<string, number>();
  for await (const path of new Bun.Glob("data/ingestion/*/metadata.json").scan(".")) {
    const metadata = await Bun.file(path).json() as { source?: string; kind?: Kind };
    if (metadata.source && metadata.kind === "exam") counts.set(metadata.source, (counts.get(metadata.source) ?? 0) + 1);
  }
  return counts;
}

export async function collect() {
  const report: ReportItem[] = [];
  const includeLegacy = Bun.argv.includes("--all");
  const counts = await examCounts();
  for (const seed of seeds) {
  if (seed.tier === "legacy" && !includeLegacy) continue;
  console.log(`\n${seed.name}`);
  try {
    const documents = await discoverOfficialPdfs(seed.source, officialUrl(seed.source, seed.pageUrl));
    for (const document of documents) {
      if (!collectable(document.label, seed.match)) {
        report.push({ seed: seed.name, url: document.url, status: "skipped" });
        continue;
      }

      try {
        const kind: Kind = seed.kind ?? (/gabarito/i.test(document.label) ? "answer-key" : "exam");
        if (kind === "exam" && (counts.get(seed.source) ?? 0) >= MAX_EXAMS_PER_SOURCE) {
          report.push({ seed: seed.name, url: document.url, status: "skipped" });
          continue;
        }
        const result = await importPdf(seed.source, kind, seed.eventDate, document.url);
        report.push({ seed: seed.name, url: document.url, status: result.cached ? "cached" : "imported" });
        if (!result.cached && kind === "exam") counts.set(seed.source, (counts.get(seed.source) ?? 0) + 1);
        console.log(`  ${result.cached ? "•" : "✓"} ${document.label}`);
      } catch (error) {
        report.push({ seed: seed.name, url: document.url, status: "failed", error: error instanceof Error ? error.message : String(error) });
        console.log(`  ✗ ${document.label}`);
      }
    }
  } catch (error) {
    report.push({ seed: seed.name, url: seed.pageUrl, status: "failed", error: error instanceof Error ? error.message : String(error) });
    console.log("  ✗ página indisponível");
  }
  }

  await mkdir("data", { recursive: true });
  await Bun.write(join("data", "collection-report.json"), JSON.stringify({ completedAt: new Date().toISOString(), report }, null, 2));
  console.log(`\nConcluído: ${report.filter((item) => item.status === "imported").length} novos, ${report.filter((item) => item.status === "cached").length} já existentes, ${report.filter((item) => item.status === "failed").length} falharam.`);
}

if (import.meta.main) await collect();
