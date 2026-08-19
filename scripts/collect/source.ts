const hosts = {
  fgv: ["conhecimento.fgv.br", "oab.fgv.br"],
  inep: ["www.gov.br", "download.inep.gov.br"],
  cebraspe: ["www.cebraspe.org.br", "cdn.cebraspe.org.br"],
  vunesp: ["www.vunesp.com.br", "documento.vunesp.com.br", "provaopaulistaseriado.vunesp.com.br"],
  fcc: ["www.concursosfcc.com.br", "concursosfcc.com.br"],
  ibfc: ["concursos.ibfc.org.br", "concursos-adm-sigcp.ibfc.org.br", "fs.ibfc.org.br", "anexos.cdn.selecao.net.br"],
  aocp: ["www2.institutoaocp.org.br", "institutoaocp.org.br"],
  consulplan: ["www.institutoconsulplan.org.br", "cdnsite.institutoconsulplan.org.br", "www.consulplan.net", "cdnsite.consulplan.net"],
  iades: ["iades.com.br", "www.iades.com.br"],
  idecan: ["www.idecan.org.br", "idecan.org.br", "concurso.idecan.org.br"],
  cesgranrio: ["concursos.cesgranrio.org.br"],
} as const;

export type Source = keyof typeof hosts;

const sourceNames = Object.keys(hosts).join(", ");

export function sourceFrom(value: string | undefined): Source {
  if (value && value in hosts) return value as Source;
  throw new Error(`Fonte inválida. Use: ${sourceNames}.`);
}

export function officialUrl(source: Source, value: string): URL {
  const url = new URL(value);
  const sourceHosts: readonly string[] = hosts[source];
  if (url.protocol === "http:" && sourceHosts.includes(url.hostname)) url.protocol = "https:";
  if (url.protocol !== "https:" || !sourceHosts.includes(url.hostname)) {
    throw new Error(`A URL precisa ser HTTPS de um domínio oficial ${source.toUpperCase()}.`);
  }
  return url;
}
