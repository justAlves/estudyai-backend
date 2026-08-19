import { expect, test } from "bun:test";
import { materialReadyMessage, planReadyMessage, toWhatsAppNumber } from "./whatsapp.service";

test("converte telefone E.164 para o formato da Evolution API", () => {
  expect(toWhatsAppNumber("+55 11 99999-9999")).toBe("5511999999999");
});

test("inclui links diretos nas notificações de estudo", () => {
  expect(planReadyMessage("Ana", "Meu concurso", 0)).toContain("/p");
  expect(materialReadyMessage("Ana", "Matemática", "01TEST", 1)).toContain("/m/01TEST");
});
