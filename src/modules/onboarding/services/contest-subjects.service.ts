export function contestKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function uniqueSubjects(...groups: string[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((subject) => {
    const key = contestKey(subject);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ContestSearchCandidate = { name: string; examiningBoard?: string | null };

const ignoredWords = new Set(["de", "do", "da", "dos", "das", "e"]);

function contestWords(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function contestSearchScore(query: string, candidate: ContestSearchCandidate) {
  const queryKey = contestKey(query);
  if (queryKey.length < 2) return 0;
  const candidateKey = contestKey(candidate.name);
  const words = contestWords(candidate.name);
  const acronym = words.filter((word) => !ignoredWords.has(word)).map((word) => word[0]).join("");
  const meaningfulWords = words.filter((word) => !ignoredWords.has(word));
  if (candidateKey === queryKey) return 100;
  if (acronym.startsWith(queryKey)) return 90;
  if (candidateKey.startsWith(queryKey)) return 80;
  if (meaningfulWords.some((word) => word.startsWith(queryKey))) return 70;
  if (candidateKey.includes(queryKey)) return 50;
  return 0;
}

export function searchContestCandidates(query: string, candidates: ContestSearchCandidate[], limit = 8) {
  return [...new Map(candidates.map((candidate) => [contestKey(candidate.name), candidate])).values()]
    .map((candidate) => ({ candidate, score: contestSearchScore(query, candidate) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, "pt-BR"))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
