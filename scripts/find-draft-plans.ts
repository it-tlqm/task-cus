import { prisma } from '../src/server/db';

async function main() {
  const plans = await prisma.plan.findMany({
    where: {
      unit: { code: 'BP_NGHIEPVU_A' },
      status: 'DRAFT',
    },
    include: {
      period: true,
      unit: true,
      items: {
        include: {
          group: true,
          workItems: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Tìm thấy ${plans.length} kế hoạch DRAFT cho BP_NGHIEPVU_A:`);
  plans.forEach((p, i) => {
    console.log(`[${i}] ID: ${p.id} | Title: "${p.title}" | Items count: ${p.items.length}`);
    p.items.forEach((it, idx) => {
      console.log(`     - Item ${idx+1}: ID=${it.id}, Title="${it.title}", Group=${it.group?.name}, workItems=${it.workItems.length}`);
    });
  });
}

main().catch(console.error);
