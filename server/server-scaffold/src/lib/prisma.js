// A single shared PrismaClient instance. Importing this file anywhere in
// the app reuses the same connection pool instead of opening a new one
// per request/route module.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;
