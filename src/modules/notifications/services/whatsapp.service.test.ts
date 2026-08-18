import { expect, test } from "bun:test";
import { toWhatsAppNumber } from "./whatsapp.service";

test("converte telefone E.164 para o formato da Evolution GO", () => {
  expect(toWhatsAppNumber("+55 11 99999-9999")).toBe("5511999999999");
});
