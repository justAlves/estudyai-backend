import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function extractNoticeText(file: File) {
  const directory = await mkdtemp(join(tmpdir(), "estudeai-uploaded-notice-"));
  const pdf = join(directory, "notice.pdf");
  const text = join(directory, "notice.txt");
  try {
    await Bun.write(pdf, file);
    const process = Bun.spawn(["pdftotext", "-raw", pdf, text], { stdout: "ignore", stderr: "ignore" });
    if ((await process.exited) !== 0) throw new Error("Não foi possível ler o texto desse PDF.");
    const extracted = await Bun.file(text).text();
    if (extracted.replace(/\s+/g, "").length < 300) throw new Error("Esse PDF parece ser uma imagem ou não contém texto suficiente.");
    return extracted.slice(0, 180_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
