import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await prisma.formTemplate.findMany({
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, templates });
  } catch (err: any) {
    console.error("Error in GET /api/admin/forms:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkPermission(user, "catalog.manage") && user.role !== "SYSTEM_ADMIN" && user.role !== "UNIT_LEADER") {
      return NextResponse.json(
        { error: "Bạn không có quyền quản trị cấu hình biểu mẫu động" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { templateId, code, name, description, schemaJson, versionNote } = body;

    let targetTemplate = null;

    if (templateId) {
      targetTemplate = await prisma.formTemplate.findUnique({
        where: { id: templateId },
        include: { versions: { orderBy: { version: "desc" } } },
      });
    } else {
      // Tìm theo code hoặc tạo mới
      const formCode = code || `FORM-${Date.now().toString().slice(-4)}`;
      targetTemplate = await prisma.formTemplate.create({
        data: {
          code: formCode,
          name: name || "Biểu mẫu tác nghiệp Hải quan mới",
          description: description || "Biểu mẫu do quản trị viên thiết kế động",
          status: "ACTIVE",
        },
        include: { versions: true },
      });
    }

    if (!targetTemplate) {
      return NextResponse.json({ error: "Không tìm thấy biểu mẫu gốc" }, { status: 404 });
    }

    // Tính số phiên bản kế tiếp (v1 -> v2)
    const latestVersion = targetTemplate.versions[0]?.version || 0;
    const newVersionNum = latestVersion + 1;

    // Đánh dấu các phiên bản cũ là ARCHIVED/SUPERSEDED
    if (targetTemplate.versions.length > 0) {
      await prisma.formTemplateVersion.updateMany({
        where: { formTemplateId: targetTemplate.id },
        data: { status: "SUPERSEDED" },
      });
    }

    // Tạo phiên bản mới bất biến (AT-12)
    const newVersion = await prisma.formTemplateVersion.create({
      data: {
        formTemplateId: targetTemplate.id,
        version: newVersionNum,
        schemaJson: schemaJson || { fields: [] },
        status: "ACTIVE",
        publishedAt: new Date(),
      },
    });

    // Ghi Audit Trail
    await recordAuditEvent({
      actorId: user.id,
      action: "FORM_TEMPLATE_VERSION_PUBLISHED",
      resourceType: "FormTemplate",
      resourceId: targetTemplate.id,
      newData: {
        templateCode: targetTemplate.code,
        version: newVersionNum,
        note: versionNote || `Phát hành phiên bản biểu mẫu v${newVersionNum}`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        template: targetTemplate,
        version: newVersion,
        message: `Đã phát hành thành công phiên bản v${newVersionNum} cho biểu mẫu ${targetTemplate.name}`,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error in POST /api/admin/forms:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
