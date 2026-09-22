import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  // Your generator uses "prisma-client-js" (the classic client), so the
  // classic query engine is used here too and PrismaClient doesn't need a
  // driver adapter. If you switch to the new "prisma-client" generator
  // later, remove this line and pass an adapter (e.g. @prisma/adapter-pg)
  // when constructing PrismaClient in prisma/seed.js instead.
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
