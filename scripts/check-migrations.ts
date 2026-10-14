import { prisma } from "../src/server/db";

async function main() {
  const result: any[] = await prisma.$queryRawUnsafe(`SELECT id, migration_name, finished_at FROM _prisma_migrations ORDER BY started_at ASC`);
  console.log("Migrations in DB:", result.map(r => r.migration_name));
}

main().catch(console.error).finally(() => process.exit(0));
