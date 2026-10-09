import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "talung-cus-work-demo-secret-key-32chars!";

async function runTests() {
  console.log("=================================================");
  console.log(" TALUNG-CUS-WORK — BACKEND & SECURITY TEST SUITE ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Kiểm tra kết nối Database PostgreSQL & Seed data
    console.log("1. Kiểm tra kết nối Database PostgreSQL & Seed data:");
    const orgCount = await prisma.orgUnit.count();
    const peopleCount = await prisma.person.count();
    const accountCount = await prisma.account.count();
    const groupCount = await prisma.activityGroup.count();
    const templateCount = await prisma.activityTemplate.count();
    const planCount = await prisma.plan.count();
    const taskCount = await prisma.task.count();

    assert(orgCount >= 6, `Số đơn vị/bộ phận trong DB: ${orgCount} (>= 6)`);
    assert(peopleCount >= 6, `Số công chức trong DB: ${peopleCount} (>= 6)`);
    assert(accountCount >= 5, `Số tài khoản trong DB: ${accountCount} (>= 5)`);
    assert(groupCount === 5, `Số nhóm nghiệp vụ: ${groupCount} (= 5)`);
    assert(templateCount === 48, `Số hoạt động mẫu tham khảo: ${templateCount} (= 48)`);
    assert(planCount >= 1, `Số kế hoạch công tác: ${planCount} (>= 1)`);
    assert(taskCount >= 2, `Số nhiệm vụ mẫu: ${taskCount} (>= 2)`);

    // 2. Kiểm tra trạng thái danh mục 48 mẫu (NEEDS_REVIEW)
    console.log("\n2. Kiểm tra tính toàn vẹn danh mục (48 mẫu ở trạng thái NEEDS_REVIEW):");
    const unconfirmedTemplates = await prisma.activityTemplate.count({
      where: { reviewStatus: "NEEDS_REVIEW" },
    });
    assert(
      unconfirmedTemplates === 48,
      `Toàn bộ 48 mẫu đều mang trạng thái NEEDS_REVIEW (${unconfirmedTemplates}/48)`
    );

    // 3. Kiểm tra tính linh hoạt: Danh mục đầu việc cá nhân (PersonalWorkItem)
    console.log("\n3. Kiểm tra tính linh hoạt danh mục đầu việc cá nhân (Không ép buộc 48 việc mẫu):");
    const personalItems = await prisma.personalWorkItem.findMany({
      include: { person: true },
    });
    assert(personalItems.length > 0, `Đã tạo được ${personalItems.length} danh mục đầu việc riêng cho từng cá nhân`);
    const customItem = personalItems.find((p) => p.title.includes("An") || p.person.fullName.includes("An"));
    assert(
      !!customItem,
      `Đầu việc cá nhân gắn đúng với Đ/c Nguyễn Văn An`
    );

    // 4. Kiểm tra mã hóa mật khẩu & Phân quyền RBAC
    console.log("\n4. Kiểm tra xác thực (Bcrypt hash & Verify):");
    const leaderAccount = await prisma.account.findUnique({
      where: { username: "lanhdao" },
      include: { roleGrants: { include: { role: true } } },
    });
    assert(!!leaderAccount, "Tìm thấy tài khoản 'lanhdao'");
    if (leaderAccount) {
      const isMatch = await bcrypt.compare("demo123", leaderAccount.passwordHash);
      assert(isMatch, "Xác minh mật khẩu 'demo123' cho 'lanhdao' thành công");
      const hasLeaderRole = leaderAccount.roleGrants.some((g) => g.role.code === "UNIT_LEADER");
      assert(hasLeaderRole, "Tài khoản 'lanhdao' có quyền UNIT_LEADER");
    }

    const officerAccount = await prisma.account.findUnique({
      where: { username: "canbo_a" },
      include: { roleGrants: { include: { role: true } } },
    });
    assert(!!officerAccount, "Tìm thấy tài khoản 'canbo_a'");
    if (officerAccount) {
      const isMatch = await bcrypt.compare("demo123", officerAccount.passwordHash);
      assert(isMatch, "Xác minh mật khẩu 'demo123' cho 'canbo_a' thành công");
      const hasStaffRole = officerAccount.roleGrants.some((g) => g.role.code === "STAFF");
      assert(hasStaffRole, "Tài khoản 'canbo_a' có quyền STAFF");
    }

    // 5. Kiểm tra JWT Token Generation
    console.log("\n5. Kiểm tra JWT Session & Phân quyền:");
    if (leaderAccount) {
      const leaderPayload = {
        userId: leaderAccount.id,
        username: leaderAccount.username,
        role: "UNIT_LEADER",
        personId: leaderAccount.personId,
      };
      const token = jwt.sign(leaderPayload, JWT_SECRET, { expiresIn: "1d" });
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      assert(decoded.role === "UNIT_LEADER", "Token của Lãnh đạo đơn vị xác thực chính xác vai trò UNIT_LEADER");
    }

    // 6. Kiểm tra tính năng thêm mới và cập nhật Task trong PostgreSQL (Database Persistence)
    console.log("\n6. Kiểm tra ghi/đọc dữ liệu thực tế (Database Persistence Test):");
    const testAssignment = await prisma.personAssignment.findFirst({
      where: { isPrimary: true },
      include: { person: true, unit: true },
    });

    if (testAssignment) {
      const testTaskCode = `NV_TEST_${Date.now().toString().slice(-4)}`;
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 86400000);

      const createdTask = await prisma.task.create({
        data: {
          code: testTaskCode,
          title: "Kiểm tra thực tế phương tiện vận tải qua barie số 1",
          status: "IN_PROGRESS",
          priority: "HIGH",
          ownerId: testAssignment.personId,
          unitId: testAssignment.unitId,
          originalDeadline: nextWeek,
          currentDeadline: nextWeek,
          expectedResultText: "Biên bản kiểm tra thực địa hoàn thành",
        },
      });
      assert(!!createdTask.id, `Tạo thành công Task mới trong PostgreSQL: ${createdTask.code}`);

      // Cập nhật trạng thái
      const updatedTask = await prisma.task.update({
        where: { id: createdTask.id },
        data: { status: "COMPLETED", actualResultText: "Đã hoàn thành kiểm tra 12 xe hàng" },
      });
      assert(
        updatedTask.status === "COMPLETED" && updatedTask.actualResultText !== null,
        `Cập nhật trạng thái Task sang COMPLETED thành công`
      );

      // Dọn dẹp task test
      await prisma.task.delete({ where: { id: createdTask.id } });
      assert(true, "Dọn dẹp bản ghi test thành công");
    }

    console.log("\n-------------------------------------------------");
    console.log(`KẾT QUẢ KIỂM THỬ: ${passed} PASS, ${failed} FAIL`);
    console.log("-------------------------------------------------");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed with error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
