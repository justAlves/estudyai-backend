import type { Source } from "./source";
import type { Kind } from "./import-pdf";

export type Seed = {
  name: string;
  tier: "current" | "legacy";
  source: Source;
  pageUrl: string;
  eventDate: string;
  match: RegExp;
  kind?: Kind;
};

// Curated historical pages only. Add a page here after confirming its exam date.
export const seeds: Seed[] = [
  { name: "PC-GO 2016", tier: "legacy", source: "cebraspe", pageUrl: "https://cdn.cebraspe.org.br/concursos/pc_go_16/", eventDate: "2016-10-16", match: /caderno|modelo\(s\) de prova|gabarito/i },
  { name: "PC-GO Delegado 2017", tier: "legacy", source: "cebraspe", pageUrl: "https://cdn.cebraspe.org.br/concursos/PC_GO_16_DELEGADO/", eventDate: "2017-02-05", match: /caderno de provas/i },
  { name: "SEE-DF 2017", tier: "legacy", source: "cebraspe", pageUrl: "https://cdn.cebraspe.org.br/concursos/SEE_16_DF/", eventDate: "2017-01-29", match: /caderno de provas/i },
  { name: "44º Exame da OAB 2025", tier: "current", source: "fgv", pageUrl: "https://oab.fgv.br/NovoSec.aspx?codSec=5136&key=l1F2R7SdiEk%3D", eventDate: "2025-10-19", match: /caderno de provas/i },
  { name: "CFSd PM/BM 2023", tier: "legacy", source: "ibfc", pageUrl: "https://concursos.ibfc.org.br/informacoes/430/", eventDate: "2023-10-29", match: /caderno de quest/i },
  { name: "ESP-DF 2025", tier: "current", source: "iades", pageUrl: "https://iades.com.br/inscricao/ProcessoSeletivo.aspx?id=9e8bf77eea", eventDate: "2025-09-28", match: /provas objetivas aplicadas/i },
];
