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
