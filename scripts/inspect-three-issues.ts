import { prisma } from '../src/server/db';

async function main() {
  console.log('================================================================');
  console.log('XÁC MINH 3 VẤN ĐỀ NGHIỆP VỤ THEO YÊU CẦU CỦA NGƯỜI DÙNG');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // VẤN ĐỀ 1: KIỂM TRA DỮ LIỆU ĐẦU VIỆC CÓ DẤU HIỆU TRÙNG LẶP
  // -------------------------------------------------------------
  console.log('-------------------------------------------------------------');
  console.log('1. ĐỐI SOÁT CÁC CẶP BẢN GHI TRÙNG NỘI DUNG:');
  console.log('-------------------------------------------------------------');

  const pairs = [
    { label: 'Cặp dòng 4 & 5', ids: ['099f7ed8-9977-46d2-aa75-9935e9eeb19b', '37bd6190-d637-40bf-be0d-3e8fc37492ad'] },
    { label: 'Cặp dòng 8 & 10', ids: ['ce3fb888-0a11-4ee6-ac71-99f75ce77efd', '01df3b3d-bef7-4626-8824-80b325c2799e'] },
    { label: 'Cặp dòng 9 & 11', ids: ['e118f246-5eba-451b-b5c2-cb70ee556409', '92fdd4de-f287-42b5-8d10-c540cfe4dfdb'] },
  ];

  for (const pair of pairs) {
    console.log(`\n>>> ${pair.label}:`);
    for (const id of pair.ids) {
      const item = await prisma.personalWorkItem.findUnique({
        where: { id },
        include: {
          person: true,
          template: true,
          group: true,
          planItem: {
            include: {
              plan: true,
            },
          },
        },
      });

      if (!item) {
        console.log(`  [ID: ${id}] -> KHÔNG TÌM THẤY TRONG BẢNG PersonalWorkItem`);
        continue;
      }

      console.log(`  - ID: ${item.id}`);
      console.log(`    Tiêu đề: "${item.title}"`);
      console.log(`    Mã mẫu (Template): ${item.template?.code || 'Không (Tự nhập)'} - ${item.template?.title || ''}`);
      console.log(`    Nhóm (Group): ${item.group?.name || 'null'}`);
      console.log(`    Cán bộ: ${item.person?.fullName} (${item.person?.code})`);
      console.log(`    workDate (UTC): ${item.workDate ? item.workDate.toISOString() : 'null'}`);
      console.log(`    dateText: "${item.dateText || ''}"`);
      console.log(`    coordinationUnit: "${item.coordinationUnit || ''}"`);
      console.log(`    priority: "${item.priority || ''}"`);
      console.log(`    expectedResult: "${item.expectedResult || ''}"`);
      console.log(`    status: "${item.status}"`);
      console.log(`    sortOrder: ${item.sortOrder}`);
      console.log(`    createdAt (UTC): ${item.createdAt.toISOString()}`);
      console.log(`    createdAt (Local VN): ${new Date(item.createdAt.getTime() + 7 * 3600000).toISOString().replace('Z', '+07:00')}`);
      console.log(`    updatedAt (UTC): ${item.updatedAt.toISOString()}`);
      console.log(`    PlanItem ID: ${item.planItemId} (Kế hoạch: ${item.planItem?.plan?.title || 'null'})`);
    }
  }

  // Lấy toàn bộ 11 items thuộc kế hoạch tuần 41 của canbo_a để xem timeline tạo
  const planW41 = await prisma.plan.findUnique({
    where: { id: '3b07d2be-b1db-4a75-ac0f-a0b1257a46ee' },
    include: {
      items: {
        include: {
          workItems: {
            where: {
              person: {
                account: {
                  username: 'canbo_a',
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          taskLinks: {
            include: {
              task: {
                include: { owner: true, assignees: { include: { person: true } } },
              },
            },
          },
        },
      },
    },
  });

  console.log('\n--- Timeline tạo các PersonalWorkItem của canbo_a trong Kế hoạch Tuần 41: ---');
  const allPersonalItems = planW41?.items.flatMap((pi) => pi.workItems) || [];
  allPersonalItems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  allPersonalItems.forEach((it, idx) => {
    console.log(`  #${idx + 1} | Tạo lúc: ${it.createdAt.toISOString()} | ID: ${it.id} | Tiêu đề: "${it.title.substring(0, 50)}..." | Ngày: "${it.dateText || ''}"`);
  });

  // -------------------------------------------------------------
  // VẤN ĐỀ 2: XÁC MINH KỲ TUẦN 41/2026 TRONG POSTGRESQL & MÚI GIỜ
  // -------------------------------------------------------------
  console.log('\n-------------------------------------------------------------');
  console.log('2. XÁC MINH THỜI GIAN KỲ TUẦN 41/2026:');
  console.log('-------------------------------------------------------------');

  const periodW41 = await prisma.reportingPeriod.findUnique({
    where: { id: '5859cc38-a9a4-4d16-aa67-140d9a55753d' },
  });

  console.log('Bản ghi ReportingPeriod Tuần 41:');
  console.log(JSON.stringify(periodW41, null, 2));

  if (periodW41) {
    console.log(`  startAt (Raw UTC): ${periodW41.startAt.toISOString()}`);
    console.log(`  endAt (Raw UTC): ${periodW41.endAt.toISOString()}`);

    // Giờ VN (+7)
    const startVN = new Date(periodW41.startAt.getTime() + 7 * 3600000);
    const endVN = new Date(periodW41.endAt.getTime() + 7 * 3600000);
    console.log(`  startAt chuyển đổi GMT+7: ${startVN.toISOString().replace('Z', '+07:00')} (${startVN.toUTCString()})`);
    console.log(`  endAt chuyển đổi GMT+7: ${endVN.toISOString().replace('Z', '+07:00')} (${endVN.toUTCString()})`);
  }

  // Kiểm tra tất cả các kỳ tuần trong hệ thống
  const allWeekPeriods = await prisma.reportingPeriod.findMany({
    where: { type: 'WEEK' },
    orderBy: { startAt: 'asc' },
    select: { id: true, title: true, startAt: true, endAt: true, isLocked: true },
  });

  console.log('\nDanh sách các kỳ tuần trong hệ thống:');
  allWeekPeriods.forEach((p) => {
    const sVN = new Date(p.startAt.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const eVN = new Date(p.endAt.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    console.log(`  - "${p.title}" (ID: ${p.id}) | startAt UTC: ${p.startAt.toISOString()} | endAt UTC: ${p.endAt.toISOString()} | VN: ${sVN} -> ${eVN}`);
  });

  // Kiểm tra cách chuỗi "Kỳ Tuần 41 (06/10/2026 - 12/10/2026)" xuất hiện trong codebase
  console.log('\nChuỗi title của periodW41 thực tế trong DB: "' + periodW41?.title + '"');

  // -------------------------------------------------------------
  // VẤN ĐỀ 3: XỬ LÝ TASK CHƯA PHÂN NHÓM NGHIỆP VỤ (NV-055793)
  // -------------------------------------------------------------
  console.log('\n-------------------------------------------------------------');
  console.log('3. XÁC MINH TASK NV-055793 VÀ LIÊN KẾT NHÓM NGHIỆP VỤ:');
  console.log('-------------------------------------------------------------');

  const task = await prisma.task.findFirst({
    where: {
      OR: [
        { code: 'NV-055793' },
        { title: { contains: 'gia công' } },
        { id: 'adc85b6c-5510-4221-be20-52d16beca196' },
      ],
    },
    include: {
      owner: true,
      unit: true,
      assignees: { include: { person: true } },
      planLinks: {
        include: {
          planItem: {
            include: {
              group: true,
              plan: true,
            },
          },
        },
      },
    },
  });

  console.log('Chi tiết Task tìm được:');
  if (task) {
    console.log(`  ID: ${task.id}`);
    console.log(`  Mã: ${task.code}`);
    console.log(`  Tiêu đề: "${task.title}"`);
    console.log(`  Chủ trì (Owner): ${task.owner?.fullName} (${task.owner?.code})`);
    console.log(`  Đơn vị: ${task.unit?.name}`);
    console.log(`  Hạn hoàn thành (currentDeadline): ${task.currentDeadline?.toISOString()}`);
    console.log(`  Trạng thái: ${task.status}`);
    console.log(`  Số liên kết PlanLinks: ${task.planLinks.length}`);
    task.planLinks.forEach((pl, idx) => {
      console.log(`    Link #${idx + 1}:`);
      console.log(`      PlanItem ID: ${pl.planItemId}`);
      console.log(`      PlanItem Title: "${pl.planItem?.title}"`);
      console.log(`      PlanItem GroupId: ${pl.planItem?.groupId}`);
      console.log(`      PlanItem Group: ${pl.planItem?.group?.name || 'NULL (CHƯA PHÂN NHÓM)'}`);
      console.log(`      Kế hoạch: "${pl.planItem?.plan?.title}" (ID: ${pl.planItem?.planId})`);
    });
  } else {
    console.log('  KHÔNG TÌM THẤY TASK VỚI MÃ HOẶC TIÊU ĐỀ NÀY!');
  }

  // Kiểm tra toàn bộ danh mục ActivityGroup trong CSDL
  const activityGroups = await prisma.activityGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, code: true, name: true, sortOrder: true },
  });

  console.log('\nDanh sách 5 nhóm nghiệp vụ chuẩn trong ActivityGroup:');
  activityGroups.forEach((g) => {
    console.log(`  - [${g.code}] (ID: ${g.id}) ${g.name} (sortOrder: ${g.sortOrder})`);
  });

  // Kiểm tra toàn bộ PlanItem trong Kế hoạch Tuần 41 xem có những PlanItem nào và groupId ra sao
  const allPlanItemsW41 = await prisma.planItem.findMany({
    where: { planId: '3b07d2be-b1db-4a75-ac0f-a0b1257a46ee' },
    include: { group: true },
    orderBy: { sortOrder: 'asc' },
  });

  console.log(`\nToàn bộ các PlanItem trong Kế hoạch Tuần 41 (${allPlanItemsW41.length} mục):`);
  allPlanItemsW41.forEach((pi, idx) => {
    console.log(`  [${idx + 1}] ID: ${pi.id} | Title: "${pi.title}" | GroupId: ${pi.groupId} | Nhóm: ${pi.group?.name || 'NULL (Chưa phân nhóm)'}`);
  });
}

main().catch(console.error);
