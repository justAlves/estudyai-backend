import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { db } from "../../../database";
import { launchLeads } from "../../../database/tables/launch-leads.table";

const launchLeadDto = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  phone: z.string().regex(/^\+55\d{10,11}$/, "Informe um telefone brasileiro válido."),
  wantsNotification: z.boolean().default(false),
  website: z.string().max(0).optional(),
});

export const launchController = new Elysia({ prefix: "/launch", tags: ["Launch"] }).post(
  "/pre-register",
  async ({ body, set }) => {
    if (body.website) {
      return { received: true };
    }

    const { website: _, ...lead } = body;
    const [saved] = await db
      .insert(launchLeads)
      .values({ id: ulid(), ...lead })
      .onConflictDoUpdate({
        target: launchLeads.phone,
        set: { name: lead.name, wantsNotification: lead.wantsNotification, updatedAt: new Date() },
      })
      .returning({ id: launchLeads.id });

    set.status = 201;
    return { received: true, id: saved?.id };
  },
  { body: launchLeadDto, detail: { summary: "Registra interesse no lançamento" } },
);
