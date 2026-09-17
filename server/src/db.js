const { PrismaClient } = require('@prisma/client');

// Reuse a single Prisma client across the app instead of creating a new
// one per request -- avoids exhausting database connections.
const prisma = new PrismaClient();

module.exports = prisma;
