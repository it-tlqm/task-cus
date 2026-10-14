import { prisma } from '../src/server/db';

async function main() {
  const plans = await prisma.plan.findMany({
    where: {
      title: { contains: 'Tuần 41' },
    },
    include: {
      period: true,
      unit: true,
      items: {
        include: {
          workItems: {
            include: {
              person: true,
            },
          },
          taskLinks: {
            include: {
              task: {
                include: {
                  owner: true,
                  assignees: true,
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(`Found ${plans.length} plans with 'Tuần 41':`);
  for (const p of plans) {
    let wiCount = 0;
    let tlCount = 0;
    p.items.forEach((it) => {
      wiCount += it.workItems.length;
      tlCount += it.taskLinks.length;
    });
    console.log(`Plan [${p.id}] Status: ${p.status} | Title: "${p.title}" | Unit: ${p.unit?.name} | PeriodId: ${p.periodId} | Items: ${p.items.length} | WIs: ${wiCount} | TaskLinks: ${tlCount}`);
    
    // In chi tiết nếu có WIs
    if (wiCount > 0) {
      p.items.forEach(it => {
        it.workItems.forEach(w => {
          console.log(`   -> WI: ${w.id} | ${w.title} | Person: ${w.person?.fullName} (${w.personId})`);
        });
      });
    }
  }

  // Ngoài ra, kiểm tra có bao nhiêu PersonalWorkItem có periodId của Tuần 41 nhưng planItemId là null hoặc trỏ tới đâu
  const period41 = await prisma.reportingPeriod.findFirst({
    where: { title: { contains: '41' } },
  });
  console.log('\nReportingPeriod 41:', period41?.id, period41?.title);

  if (period41) {
    const allWIs = await prisma.personalWorkItem.findMany({
      where: { periodId: period41.id },
      include: { person: true, planItem: { include: { plan: true } } },
    });
    console.log(`Total PersonalWorkItems in period 41: ${allWIs.length}`);
    for (const w of allWIs) {
      console.log(`   WI [${w.id}] | Person: ${w.person.fullName} | planItemId: ${w.planItemId} | Plan: ${w.planItem?.plan?.title || 'NONE'} | Title: "${w.title}"`);
    }
  }
}

main().catch(console.error);
