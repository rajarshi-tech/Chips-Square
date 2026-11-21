import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/identity";
import { signSessionToken } from "@/lib/auth/token";
import { getAuthSecret, SESSION_TTL_MS } from "@/lib/auth/session";

async function main() {
  for (const email of ["owner@chipssquare.in", "staff@chipssquare.in"]) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    console.log(
      `${(user.role as string).toLowerCase()}=` +
        signSessionToken({ sub: user.id, exp: Date.now() + SESSION_TTL_MS }, getAuthSecret()),
    );
  }
  const [cycle] = await db.select({ id: users.id }).from(users).limit(1);
  void cycle;
}
main().then(() => process.exit(0));
