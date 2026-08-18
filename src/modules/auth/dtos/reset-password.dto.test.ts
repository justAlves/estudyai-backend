import { expect, test } from "bun:test";
import { resetPasswordDto } from "./reset-password.dto";

test("aceita apenas códigos de redefinição com seis dígitos", () => {
  const input = { email: "ana@example.com", code: "123456", password: "segredo123" };

  expect(resetPasswordDto.safeParse(input).success).toBe(true);
  expect(resetPasswordDto.safeParse({ ...input, code: "12345" }).success).toBe(false);
});
