import { prisma } from '../src/server/db';

async function main() {
  const items = await prisma.personalWorkItem.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { template: true, planItem: true, person: true }
  });

  console.log('10 PersonalWorkItem mới nhất trong PostgreSQL:');
  items.forEach((it, i) => {
    console.log(`[${i+1}] ID: ${it.id} | Title: "${it.title}" | PlanItemID: ${it.planItemId} | Template: ${it.template?.title || 'TỰ DO'} | Cán bộ: ${it.person.fullName} | Ngày tạo: ${it.createdAt.toISOString()}`);
  });
}

main().catch(console.error);
