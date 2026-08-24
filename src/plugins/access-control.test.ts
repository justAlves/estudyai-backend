import { expect, test } from "bun:test";
import { userIdFrom } from "./access-control";

test("extrai o subject de tokens Bearer com ou sem prefixo", async () => {
  const verify = async (token: string) => ({ sub: token });

  expect(await userIdFrom("Bearer user-123", verify)).toBe("user-123");
  expect(await userIdFrom("user-456", verify)).toBe("user-456");
});

test("rejeita autorização ausente, payload inválido e subject não textual", async () => {
  const invalid = async () => ({ foo: "bar" });
  const nonStringSubject = async () => ({ sub: 123 });

  expect(await userIdFrom(undefined, invalid)).toBeUndefined();
  expect(await userIdFrom("token", invalid)).toBeUndefined();
  expect(await userIdFrom("token", nonStringSubject)).toBeUndefined();
});
