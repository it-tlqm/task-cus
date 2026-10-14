import { prisma } from '../src/server/db';

async function run() {
  const tpls = await prisma.activityTemplate.findMany({
    where: {
      OR: [
        { code: { contains: 'GSHQ' } },
        { title: { contains: 'GPS' } },
      ],
    },
    include: { group: true },
    orderBy: { code: 'asc' },
  });

  console.log(`Tìm thấy ${tpls.length} mẫu liên quan đến GSHQ và GPS:`);
  tpls.forEach((t) => {
    console.log(`- Mã: [${t.code}] | Nhóm: [${t.group?.name || 'N/A'}] | Tiêu đề: "${t.title}"`);
  });
}

run().catch(console.error);
