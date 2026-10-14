import { prisma } from '../src/server/db';

async function run() {
  const plans = await prisma.plan.findMany({
    include: {
      period: true,
      unit: true,
      items: {
        include: {
          group: true,
          workItems: {
            include: {
              person: true,
              template: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Tổng số kế hoạch trong DB: ${plans.length}`);
  plans.forEach((p, idx) => {
    console.log(`[${idx + 1}] Plan ID: ${p.id}`);
    console.log(`    Tiêu đề: "${p.title}" | Trạng thái: ${p.status}`);
    console.log(`    Đơn vị: ${p.unit.name} (${p.unit.code}) | Kỳ: ${p.period.name}`);
    console.log(`    Số PlanItem nhóm: ${p.items.length}`);
    p.items.forEach((item, itemIdx) => {
      console.log(`       - Item [${itemIdx + 1}]: "${item.title}" (Group: ${item.group?.name || 'N/A'}), Số workItems: ${item.workItems.length}`);
      item.workItems.forEach((wi) => {
        console.log(`           * WorkItem: "${wi.title}" | Cán bộ: ${wi.person.fullName} | Template: ${wi.template?.title || 'Tự do'}`);
      });
    });
  });
}

run().catch(console.error);
