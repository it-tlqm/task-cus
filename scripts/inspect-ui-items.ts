import { prisma } from '../src/server/db';

async function main() {
  const plan = await prisma.plan.findFirst({
    where: {
      title: { contains: 'Tuần 41' },
      status: 'DRAFT',
    },
    include: {
      period: true,
      unit: true,
      items: {
        include: {
          group: true,
          workItems: {
            include: {
              person: true,
              group: true,
              template: true,
            },
          },
          taskLinks: {
            include: {
              task: {
                include: {
                  owner: true,
                  assignees: { include: { person: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!plan) {
    console.log('No plan found');
    return;
  }

  console.log('Plan:', plan.id, plan.title, '| Unit:', plan.unit?.name, '| Status:', plan.status);
  console.log('Items count:', plan.items.length);

  const canboA = await prisma.account.findUnique({
    where: { username: 'canbo_a' },
    include: { person: true },
  });

  console.log('canbo_a personId:', canboA?.personId, canboA?.person?.fullName);

  let uiRowCount = 0;
  plan.items.forEach((item, itemIdx) => {
    console.log(`\nItem ${itemIdx + 1}: ${item.title}`);
    item.workItems.forEach((wi) => {
      const isA = wi.personId === canboA?.personId || wi.person?.fullName === canboA?.person?.fullName;
      if (isA) {
        uiRowCount++;
        console.log(` [UI-${uiRowCount}] WI ID: ${wi.id} | Title: "${wi.title}" | Person: ${wi.person?.fullName} | Template: ${wi.template?.code} | Group: ${wi.group?.name || wi.template?.group?.name}`);
      }
    });

    item.taskLinks.forEach((tl) => {
      const t = tl.task;
      const isOwner = t.ownerId === canboA?.personId || t.owner?.fullName === canboA?.person?.fullName;
      const isAssignee = t.assignees.some((a) => a.personId === canboA?.personId);
      if (isOwner || isAssignee) {
        uiRowCount++;
        console.log(` [UI-${uiRowCount}] TASK ID: ${t.id} | Code: ${t.code} | Title: "${t.title}" | Owner: ${t.owner?.fullName} (isOwner: ${isOwner}, isAssignee: ${isAssignee})`);
      }
    });
  });

  console.log(`\nTOTAL UI ROWS FOR canbo_a in Plan: ${uiRowCount}`);
}

main().catch(console.error);
