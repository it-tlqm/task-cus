"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  Users,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderTree,
  UserCheck,
  UserX,
  ArrowRightLeft,
  KeyRound,
  Lock,
  Unlock,
  AlertCircle,
  X,
  FileText,
  BadgeAlert,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface OrgUnit {
  id: string;
  code: string;
  name: string;
  level?: number;
  type?: string;
  parentId?: string | null;
  children?: OrgUnit[];
  personnelCount?: number;
}

interface Position {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  status?: string;
}

interface Role {
  id: string;
  code: string;
  name: string;
}

interface Person {
  id: string;
  code: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE";
  isActive: boolean;
  notes?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  unitCode?: string | null;
  positionId?: string | null;
  position: string;
  orgUnit?: { id: string; name: string; code: string };
  account?: {
    id: string;
    username: string;
    role: string;
    roleName?: string;
    status: "ACTIVE" | "DISABLED" | "LOCKED";
    isActive: boolean;
    lastLoginAt?: string | null;
  } | null;
}

export default function OrganizationAdminPage() {
  const [orgTree, setOrgTree] = useState<OrgUnit[]>([]);
  const { canManageOrg } = usePermissions();
  const [flatUnits, setFlatUnits] = useState<OrgUnit[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const [selectedUnit, setSelectedUnit] = useState<OrgUnit | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchPerson, setSearchPerson] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals state
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<OrgUnit | null>(null);
  const [editUnitName, setEditUnitName] = useState("");
  const [deletingUnit, setDeletingUnit] = useState<OrgUnit | null>(null);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [posForm, setPosForm] = useState({ code: "", title: "" });
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [editPositionTitle, setEditPositionTitle] = useState("");

  const activePositions = positions.filter((p) => (p.status || "ACTIVE") === "ACTIVE");
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [transferringPerson, setTransferringPerson] = useState<Person | null>(null);
  const [accountModalPerson, setAccountModalPerson] = useState<Person | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  } | null>(null);

  // Form states & Modal inline error state
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Unit Form
  const [newUnitData, setNewUnitData] = useState({ code: "", name: "", type: "TEAM" });

  // Add Person Form
  const [newPersonData, setNewPersonData] = useState({
    code: "",
    fullName: "",
    unitId: "",
    positionId: "",
    email: "",
    phone: "",
    notes: "",
  });

  // Edit Person Form
  const [editPersonData, setEditPersonData] = useState({
    fullName: "",
    email: "",
    phone: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
    notes: "",
    positionId: "",
  });

  // Transfer Form
  const [transferData, setTransferData] = useState({
    newUnitId: "",
    newPositionId: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    decisionNumber: "",
    notes: "",
  });

  // Account Modal Form
  const [accountFormData, setAccountFormData] = useState({
    mode: "CREATE" as "CREATE" | "RESET_PASSWORD" | "CHANGE_STATUS",
    username: "",
    password: "",
    roleCode: "STAFF",
    scopeType: "DEPARTMENT",
    newPassword: "",
    newStatus: "ACTIVE" as "ACTIVE" | "DISABLED" | "LOCKED",
    statusReason: "",
  });

  // Fetch Tree, Flat units, Positions, Roles & People
  const fetchData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [resTree, resPeople, resPositions, resRoles] = await Promise.all([
        fetch("/api/org-units/tree"),
        fetch("/api/people"),
        fetch("/api/positions"),
        fetch("/api/roles"),
      ]);

      if (resTree.ok) {
        const json = await resTree.json();
        const treeData: OrgUnit[] = json.data || [];
        setOrgTree(treeData);
        setFlatUnits(json.flatList || []);

        // Expand root by default
        const initialExpanded: Record<string, boolean> = {};
        const walk = (nodes: OrgUnit[]) => {
          nodes.forEach((n) => {
            initialExpanded[n.id] = true;
            if (n.children) walk(n.children);
          });
        };
        walk(treeData);
        setExpandedNodes((prev) => (Object.keys(prev).length === 0 ? initialExpanded : prev));

        if (treeData.length > 0 && !selectedUnit) {
          setSelectedUnit(treeData[0]);
        }
      }

      if (resPeople.ok) {
        const json = await resPeople.json();
        setPeople(json.data || []);
      }

      if (resPositions.ok) {
        const json = await resPositions.json();
        setPositions(json.data || []);
      }

      if (resRoles.ok) {
        const json = await resRoles.json();
        setRoles(json.data || []);
      }
    } catch (err: any) {
      console.error("Error fetching org data:", err);
      setActionError("Lỗi kết nối khi tải dữ liệu cơ cấu tổ chức và nhân sự: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showNotification = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. Thêm bộ phận mới
  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitData.code || !newUnitData.name) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/org-units/tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newUnitData,
          parentId: selectedUnit?.id || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Không thể thêm bộ phận mới");
        return;
      }

      setShowAddUnitModal(false);
      setNewUnitData({ code: "", name: "", type: "TEAM" });
      showNotification(`Đã thêm bộ phận "${newUnitData.name}" thành công`);
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1b. Đổi tên đơn vị (mã code bất biến)
  const handleOpenRenameUnit = (node: OrgUnit) => {
    setEditingUnit(node);
    setEditUnitName(node.name);
    setModalError(null);
  };

  const handleRenameUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit || !editUnitName.trim()) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/org-units/${editingUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editUnitName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Không thể đổi tên đơn vị");
        return;
      }
      setEditingUnit(null);
      showNotification(`Đã đổi tên thành "${editUnitName.trim()}"`);
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1c. Xóa đơn vị trống (server chặn khi còn dữ liệu liên quan)
  const handleDeleteUnit = async () => {
    if (!deletingUnit) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/org-units/${deletingUnit.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Không thể xóa đơn vị");
        return;
      }
      setDeletingUnit(null);
      if (selectedUnit?.id === deletingUnit.id) setSelectedUnit(null);
      showNotification(data.message || "Đã xóa đơn vị");
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1d. Quản lý chức vụ: thêm / đổi tên / ngừng dùng
  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!posForm.code.trim() || !posForm.title.trim()) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: posForm.code, title: posForm.title }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Không thể thêm chức vụ");
        return;
      }
      setPosForm({ code: "", title: "" });
      showNotification(`Đã thêm chức vụ "${posForm.title.trim()}"`);
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenamePosition = async (id: string) => {
    if (!editPositionTitle.trim()) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editPositionTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Không thể đổi tên chức vụ");
        return;
      }
      setEditingPositionId(null);
      showNotification("Đã đổi tên chức vụ");
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePosition = async (id: string, toInactive: boolean) => {
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toInactive ? "INACTIVE" : "ACTIVE" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Không thể đổi trạng thái chức vụ");
        return;
      }
      showNotification(toInactive ? "Đã ngừng dùng chức vụ" : "Đã kích hoạt lại chức vụ");
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Thêm cán bộ công chức mới
  const handleOpenAddPerson = () => {
    setNewPersonData({
      code: "",
      fullName: "",
      unitId: selectedUnit?.id || flatUnits[0]?.id || "",
      positionId: activePositions[0]?.id || "",
      email: "",
      phone: "",
      notes: "",
    });
    setModalError(null);
    setShowAddPersonModal(true);
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPersonData),
      });

      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error || "Không thể thêm cán bộ công chức");
        return;
      }

      setShowAddPersonModal(false);
      showNotification(json.message || "Đã thêm mới cán bộ công chức thành công");
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Sửa thông tin cán bộ
  const handleOpenEditPerson = (p: Person) => {
    setEditingPerson(p);
    setEditPersonData({
      fullName: p.fullName,
      email: p.email || "",
      phone: p.phone || "",
      status: p.status,
      notes: p.notes || "",
      positionId: p.positionId || "",
    });
    setModalError(null);
  };

  const handleEditPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPerson) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/people/${editingPerson.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPersonData),
      });

      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error || "Không thể cập nhật hồ sơ cán bộ");
        return;
      }

      setEditingPerson(null);
      showNotification(json.message || "Đã cập nhật hồ sơ cán bộ thành công");
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Điều chuyển đơn vị
  const handleOpenTransfer = (p: Person) => {
    setTransferringPerson(p);
    // Gợi ý đơn vị khác đơn vị hiện tại
    const otherUnit = flatUnits.find((u) => u.id !== p.unitId);
    setTransferData({
      newUnitId: otherUnit?.id || "",
      newPositionId: p.positionId || activePositions[0]?.id || "",
      effectiveDate: new Date().toISOString().slice(0, 10),
      decisionNumber: "",
      notes: "",
    });
    setModalError(null);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringPerson) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/people/${transferringPerson.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transferData),
      });

      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error || "Không thể điều chuyển cán bộ");
        return;
      }

      setTransferringPerson(null);
      showNotification(json.message || "Đã điều chuyển cán bộ thành công");
      fetchData();
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Quản lý tài khoản (Cấp mới / Đổi trạng thái / Đặt lại mật khẩu)
  const handleOpenAccountModal = (p: Person, initialMode: "CREATE" | "RESET_PASSWORD" | "CHANGE_STATUS") => {
    setAccountModalPerson(p);
    setModalError(null);

    const defaultUsername = p.account
      ? p.account.username
      : p.code.toLowerCase().replace(/[^a-z0-9]/g, "");

    setAccountFormData({
      mode: initialMode,
      username: defaultUsername,
      password: "",
      roleCode: p.account?.role || "STAFF",
      scopeType: "DEPARTMENT",
      newPassword: "",
      newStatus: p.account?.status || "ACTIVE",
      statusReason: "",
    });
  };

  const handleAccountAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountModalPerson) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      if (accountFormData.mode === "CREATE") {
        const res = await fetch(`/api/people/${accountModalPerson.id}/account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: accountFormData.username,
            password: accountFormData.password,
            roleCode: accountFormData.roleCode,
            scopeType: accountFormData.scopeType,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setModalError(json.error || "Không thể cấp tài khoản");
          return;
        }

        setAccountModalPerson(null);
        showNotification(json.message || "Đã cấp tài khoản thành công");
        fetchData();
      } else if (accountFormData.mode === "RESET_PASSWORD") {
        const res = await fetch(`/api/people/${accountModalPerson.id}/account/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPassword: accountFormData.newPassword,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setModalError(json.error || "Không thể đặt lại mật khẩu");
          return;
        }

        setAccountModalPerson(null);
        showNotification(json.message || "Đã đặt lại mật khẩu thành công");
      } else if (accountFormData.mode === "CHANGE_STATUS") {
        const res = await fetch(`/api/people/${accountModalPerson.id}/account/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: accountFormData.newStatus,
            reason: accountFormData.statusReason,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setModalError(json.error || "Không thể đổi trạng thái tài khoản");
          return;
        }

        setAccountModalPerson(null);
        showNotification(json.message || "Đã cập nhật trạng thái tài khoản thành công");
        fetchData();
      }
    } catch (err: any) {
      setModalError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Nhanh: Đổi trạng thái tài khoản từ bảng kèm Confirm Dialog
  const handleQuickToggleAccountStatus = (p: Person) => {
    if (!p.account) return;
    const isCurrentlyActive = p.account.status === "ACTIVE";
    const targetStatus = isCurrentlyActive ? "DISABLED" : "ACTIVE";
    const actionVerb = isCurrentlyActive ? "vô hiệu hóa" : "kích hoạt";

    setConfirmDialog({
      isOpen: true,
      title: `Xác nhận ${actionVerb} tài khoản`,
      message: isCurrentlyActive
        ? `Bạn có chắc chắn muốn vô hiệu hóa tài khoản "${p.account.username}" của cán bộ ${p.fullName}? Cán bộ sẽ bị đăng xuất và không thể truy cập hệ thống ngay lập tức.`
        : `Bạn có chắc chắn muốn kích hoạt lại tài khoản "${p.account.username}" cho cán bộ ${p.fullName}?`,
      isDangerous: isCurrentlyActive,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/people/${p.id}/account/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: targetStatus,
              reason: isCurrentlyActive ? "Quản trị viên vô hiệu hóa nhanh" : "Quản trị viên kích hoạt lại",
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            setActionError(json.error || "Không thể cập nhật trạng thái tài khoản");
          } else {
            showNotification(json.message || `Đã ${actionVerb} tài khoản thành công`);
            fetchData();
          }
        } catch (err: any) {
          setActionError("Lỗi kết nối: " + err.message);
        }
      },
    });
  };

  // Filter people by selected unit, status, and search
  const filteredPeople = people.filter((p) => {
    const matchesUnit = selectedUnit ? p.unitId === selectedUnit.id : true;
    const matchesStatus =
      statusFilter === "ALL"
        ? true
        : statusFilter === "ACTIVE"
        ? p.status === "ACTIVE"
        : p.status === "INACTIVE";

    const searchLower = searchPerson.toLowerCase();
    const matchesSearch =
      !searchPerson ||
      p.fullName.toLowerCase().includes(searchLower) ||
      p.code.toLowerCase().includes(searchLower) ||
      (p.email && p.email.toLowerCase().includes(searchLower)) ||
      (p.phone && p.phone.toLowerCase().includes(searchLower)) ||
      p.position.toLowerCase().includes(searchLower) ||
      (p.account && p.account.username.toLowerCase().includes(searchLower));

    return matchesUnit && matchesStatus && matchesSearch;
  });

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: OrgUnit, depth: number = 0) => {
    const isExpanded = !!expandedNodes[node.id];
    const isSelected = selectedUnit?.id === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => setSelectedUnit(node)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className={`flex items-center justify-between py-2 pr-3 rounded-lg cursor-pointer transition-colors text-xs font-medium ${
            isSelected
              ? "bg-blue-900 text-white font-semibold shadow-sm"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-0.5 rounded hover:bg-white/20"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-amber-300" : "text-blue-700"}`} />
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${
                isSelected ? "bg-blue-800 text-blue-100" : "bg-slate-100 text-slate-600"
              }`}
            >
              {node.code}
            </span>
            {typeof node.personnelCount === "number" && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? "bg-amber-400 text-blue-950 font-bold" : "bg-slate-200 text-slate-700"
                }`}
              >
                {node.personnelCount}
              </span>
            )}
            {isSelected && canManageOrg && (
              <>
                <button
                  type="button"
                  title="Đổi tên đơn vị"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenRenameUnit(node);
                  }}
                  className="p-1 rounded hover:bg-white/20 text-white"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="Xóa đơn vị (chỉ khi không còn dữ liệu)"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingUnit(node);
                    setModalError(null);
                  }}
                  className="p-1 rounded hover:bg-white/20 text-white"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-900 border border-blue-200">
              Quản trị đơn vị & Nhân sự
            </span>
            <span className="text-xs text-slate-500">Phân hệ P1 FIX 06A • Dữ liệu PostgreSQL thời gian thực</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Cơ cấu tổ chức & Quản lý cán bộ công chức</h1>
          <p className="text-sm text-slate-600">
            Quản trị sơ đồ đơn vị, hồ sơ cán bộ, lịch sử điều chuyển công tác và cấp tài khoản RBAC thực chất
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
            Làm mới
          </button>
          {canManageOrg && (
            <button
              onClick={() => {
                setModalError(null);
                setShowAddUnitModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Building2 className="w-3.5 h-3.5" />
              Thêm bộ phận
            </button>
          )}
          {canManageOrg && (
            <button
              onClick={() => {
                setPosForm({ code: "", title: "" });
                setEditingPositionId(null);
                setModalError(null);
                setShowPositionModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <BadgeAlert className="w-3.5 h-3.5" />
              Chức vụ
            </button>
          )}
          {canManageOrg && (
            <button
              onClick={handleOpenAddPerson}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm cán bộ mới
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-emerald-600 hover:underline">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:underline">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Split-pane container (35% Left Tree, 65% Right People list) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane (35% ~ 4 cols): Sơ đồ tổ chức */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <FolderTree className="w-4 h-4 text-blue-900" />
              Sơ đồ đơn vị Hải quan
            </div>
            <button
              onClick={() => setSelectedUnit(null)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                selectedUnit === null
                  ? "bg-blue-100 text-blue-900 font-semibold"
                  : "text-blue-700 hover:bg-slate-100"
              }`}
            >
              Xem tất cả ({people.length})
            </button>
          </div>

          <div className="space-y-1 max-h-[620px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-8 text-xs text-slate-400">Đang tải sơ đồ tổ chức...</div>
            ) : orgTree.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">Chưa có dữ liệu đơn vị</div>
            ) : (
              orgTree.map((node) => renderTreeNode(node, 0))
            )}
          </div>
        </div>

        {/* Right Pane (65% ~ 8 cols): Danh sách cán bộ */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-900" />
                {selectedUnit ? selectedUnit.name : "Tất cả cán bộ công chức trong đơn vị"}
                <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">
                  {filteredPeople.length} cán bộ
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedUnit
                  ? `Mã đơn vị: ${selectedUnit.code} • Cấp: ${selectedUnit.level || 2}`
                  : "Hải quan cửa khẩu Quốc tế Tà Lùng"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Lọc trạng thái hồ sơ */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang công tác</option>
                <option value="INACTIVE">Ngừng công tác</option>
              </select>

              {/* Ô tìm kiếm */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm tên, mã CC, chức vụ, user..."
                  value={searchPerson}
                  onChange={(e) => setSearchPerson(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Mã CC & Họ tên</th>
                  <th className="py-2.5 px-3">Bộ phận & Chức vụ</th>
                  <th className="py-2.5 px-3">Tài khoản & Phân quyền</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái hồ sơ</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      Không tìm thấy cán bộ công chức nào phù hợp với bộ lọc
                    </td>
                  </tr>
                ) : (
                  filteredPeople.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Mã & Họ tên */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] border border-blue-200">
                            {p.code}
                          </span>
                          <span className="font-bold text-slate-900">{p.fullName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
                          {p.email && <span>{p.email}</span>}
                          {p.phone && <span>• {p.phone}</span>}
                        </div>
                      </td>

                      {/* Bộ phận & Chức vụ */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800">{p.position}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{p.unitName || "Chưa phân công"}</span>
                        </div>
                      </td>

                      {/* Tài khoản & Role */}
                      <td className="py-3 px-3">
                        {p.account ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-blue-700" />
                              <span className="font-mono font-medium text-slate-900">
                                {p.account.username}
                              </span>
                              <span className="px-1.5 py-0.2 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[10px] font-semibold">
                                {p.account.role}
                              </span>
                            </div>
                            <div>
                              {p.account.status === "ACTIVE" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" /> Hoạt động
                                </span>
                              ) : p.account.status === "DISABLED" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700">
                                  <XCircle className="w-3 h-3" /> Vô hiệu hóa
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                                  <Lock className="w-3 h-3" /> Tạm khóa
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 italic text-[11px]">Chưa cấp</span>
                            <button
                              onClick={() => handleOpenAccountModal(p, "CREATE")}
                              className="text-[10px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition-colors"
                            >
                              + Cấp tài khoản
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Trạng thái hồ sơ */}
                      <td className="py-3 px-3 text-center">
                        {p.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <UserCheck className="w-3 h-3" /> Đang công tác
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            <UserX className="w-3 h-3" /> Ngừng công tác
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Sửa hồ sơ */}
                          <button
                            onClick={() => handleOpenEditPerson(p)}
                            title="Chỉnh sửa thông tin cán bộ"
                            className="p-1 text-slate-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Điều chuyển đơn vị */}
                          <button
                            onClick={() => handleOpenTransfer(p)}
                            title="Điều chuyển đơn vị công tác"
                            className="p-1 text-slate-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>

                          {/* Thao tác tài khoản */}
                          {p.account ? (
                            <>
                              <button
                                onClick={() => handleQuickToggleAccountStatus(p)}
                                title={
                                  p.account.status === "ACTIVE"
                                    ? "Vô hiệu hóa tài khoản"
                                    : "Kích hoạt lại tài khoản"
                                }
                                className={`p-1 rounded transition-colors ${
                                  p.account.status === "ACTIVE"
                                    ? "text-slate-600 hover:text-rose-700 hover:bg-rose-50"
                                    : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {p.account.status === "ACTIVE" ? (
                                  <Lock className="w-3.5 h-3.5" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                onClick={() => handleOpenAccountModal(p, "RESET_PASSWORD")}
                                title="Đặt lại mật khẩu"
                                className="p-1 text-slate-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: THÊM CÁN BỘ CÔNG CHỨC MỚI */}
      {/* ---------------------------------------------------- */}
      {showAddPersonModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-900" />
                Thêm mới cán bộ công chức
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPersonModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddPerson} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mã cán bộ *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: CB-050"
                    value={newPersonData.code}
                    onChange={(e) => setNewPersonData({ ...newPersonData, code: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Họ và tên *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Đ/c Vũ Mạnh Hùng"
                    value={newPersonData.fullName}
                    onChange={(e) => setNewPersonData({ ...newPersonData, fullName: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Đơn vị / Bộ phận trực thuộc *</label>
                <select
                  required
                  value={newPersonData.unitId}
                  onChange={(e) => setNewPersonData({ ...newPersonData, unitId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Chọn đơn vị công tác --</option>
                  {flatUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Chức vụ</label>
                <select
                  value={newPersonData.positionId}
                  onChange={(e) => setNewPersonData({ ...newPersonData, positionId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Chọn chức vụ công tác --</option>
                  {activePositions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Email công vụ</label>
                  <input
                    type="email"
                    placeholder="hung.vm@talung.cus.demo"
                    value={newPersonData.email}
                    onChange={(e) => setNewPersonData({ ...newPersonData, email: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    placeholder="0912.xxx.xxx"
                    value={newPersonData.phone}
                    onChange={(e) => setNewPersonData({ ...newPersonData, phone: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Ghi chú nghiệp vụ</label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú về phân công, chuyên môn..."
                  value={newPersonData.notes}
                  onChange={(e) => setNewPersonData({ ...newPersonData, notes: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPersonModal(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu vào cơ sở dữ liệu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: CHỈNH SỬA THÔNG TIN CÁN BỘ */}
      {/* ---------------------------------------------------- */}
      {editingPerson && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-900" />
                Chỉnh sửa hồ sơ cán bộ: {editingPerson.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPerson(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditPerson} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-500 block">Mã cán bộ (Bất biến):</span>
                  <span className="font-mono font-bold text-blue-950 text-xs">{editingPerson.code}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Bộ phận hiện tại:</span>
                  <span className="font-semibold text-slate-800 text-xs">{editingPerson.unitName}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={editPersonData.fullName}
                  onChange={(e) => setEditPersonData({ ...editPersonData, fullName: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Email công vụ</label>
                  <input
                    type="email"
                    value={editPersonData.email}
                    onChange={(e) => setEditPersonData({ ...editPersonData, email: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={editPersonData.phone}
                    onChange={(e) => setEditPersonData({ ...editPersonData, phone: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Chức vụ <span className="font-normal text-slate-500">(hiện tại: {editingPerson.position || "chưa rõ"})</span>
                </label>
                <select
                  value={editPersonData.positionId}
                  onChange={(e) => setEditPersonData({ ...editPersonData, positionId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Giữ nguyên chức vụ hiện tại --</option>
                  {activePositions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title} ({pos.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Trạng thái hồ sơ cán bộ</label>
                <select
                  value={editPersonData.status}
                  onChange={(e) =>
                    setEditPersonData({ ...editPersonData, status: e.target.value as "ACTIVE" | "INACTIVE" })
                  }
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ACTIVE">ACTIVE — Đang công tác</option>
                  <option value="INACTIVE">INACTIVE — Ngừng công tác (Vô hiệu hóa tài khoản liên kết)</option>
                </select>
                {editPersonData.status === "INACTIVE" && (
                  <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1 font-medium">
                    <BadgeAlert className="w-3.5 h-3.5" />
                    Khi chuyển sang Ngừng công tác, tài khoản của cán bộ sẽ tự động bị khóa truy cập ngay lập tức.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  value={editPersonData.notes}
                  onChange={(e) => setEditPersonData({ ...editPersonData, notes: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPerson(null)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Đang cập nhật..." : "Cập nhật hồ sơ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 3: ĐIỀU CHUYỂN ĐƠN VỊ CÔNG TÁC (ASSIGNMENT) */}
      {/* ---------------------------------------------------- */}
      {transferringPerson && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-900" />
                Quy trình điều chuyển công tác cán bộ
              </h3>
              <button
                type="button"
                onClick={() => setTransferringPerson(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-1">
              <div className="font-bold text-blue-950">
                {transferringPerson.fullName} ({transferringPerson.code})
              </div>
              <div className="text-slate-600">
                Đơn vị hiện tại: <span className="font-semibold text-slate-800">{transferringPerson.unitName}</span>
              </div>
              <div className="text-slate-600">
                Chức vụ hiện tại: <span className="font-semibold text-slate-800">{transferringPerson.position}</span>
              </div>
              <p className="text-[11px] text-slate-500 pt-1 italic">
                * Toàn bộ lịch sử nhiệm vụ, kế hoạch và sổ nhật ký đã phát sinh tại đơn vị cũ sẽ được bảo toàn nguyên vẹn.
              </p>
            </div>

            <form onSubmit={handleTransfer} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Đơn vị tiếp nhận mới *
                </label>
                <select
                  required
                  value={transferData.newUnitId}
                  onChange={(e) => setTransferData({ ...transferData, newUnitId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Chọn đơn vị tiếp nhận mới --</option>
                  {flatUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code}) {u.id === transferringPerson.unitId ? " (Đang công tác)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Chức vụ tại đơn vị mới
                </label>
                <select
                  value={transferData.newPositionId}
                  onChange={(e) => setTransferData({ ...transferData, newPositionId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Giữ nguyên chức vụ hiện tại --</option>
                  {activePositions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Ngày có hiệu lực điều chuyển *
                  </label>
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={transferData.effectiveDate}
                    onChange={(e) => setTransferData({ ...transferData, effectiveDate: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Chỉ chấp nhận ngày hiện tại hoặc quá khứ</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Số Quyết định điều động
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: QĐ-12/HQTL"
                    value={transferData.decisionNumber}
                    onChange={(e) => setTransferData({ ...transferData, decisionNumber: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Lý do & Ghi chú</label>
                <textarea
                  rows={2}
                  placeholder="Căn cứ yêu cầu công tác, luân chuyển định kỳ..."
                  value={transferData.notes}
                  onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferringPerson(null)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Đang xử lý..." : "Xác nhận điều chuyển"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 4: QUẢN TRỊ TÀI KHOẢN & PHÂN QUYỀN */}
      {/* ---------------------------------------------------- */}
      {accountModalPerson && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-900" />
                {accountFormData.mode === "CREATE"
                  ? "Cấp tài khoản mới"
                  : accountFormData.mode === "RESET_PASSWORD"
                  ? "Đặt lại mật khẩu xác thực"
                  : "Thay đổi trạng thái tài khoản"}
              </h3>
              <button
                type="button"
                onClick={() => setAccountModalPerson(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="text-slate-500">Cán bộ: </span>
              <span className="font-bold text-slate-900">{accountModalPerson.fullName}</span>{" "}
              <span className="font-mono text-slate-600">({accountModalPerson.code})</span>
            </div>

            <form onSubmit={handleAccountAction} className="space-y-3">
              {/* Form cấp tài khoản mới */}
              {accountFormData.mode === "CREATE" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Tên đăng nhập (Username) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="chữ thường, số, gạch dưới..."
                      value={accountFormData.username}
                      onChange={(e) =>
                        setAccountFormData({ ...accountFormData, username: e.target.value.toLowerCase() })
                      }
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Mật khẩu khởi tạo * (tối thiểu 8 ký tự, gồm cả chữ và số)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Nhập mật khẩu an toàn..."
                      value={accountFormData.password}
                      onChange={(e) => setAccountFormData({ ...accountFormData, password: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Vai trò hệ thống (Role) *</label>
                    <select
                      value={accountFormData.roleCode}
                      onChange={(e) => setAccountFormData({ ...accountFormData, roleCode: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.code}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Phạm vi thẩm quyền (Scope)</label>
                    <select
                      value={accountFormData.scopeType}
                      onChange={(e) => setAccountFormData({ ...accountFormData, scopeType: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="DEPARTMENT">DEPARTMENT — Phạm vi Bộ phận / Đội trực thuộc</option>
                      <option value="ORGANIZATION">ORGANIZATION — Toàn bộ đơn vị</option>
                    </select>
                  </div>
                </>
              )}

              {/* Form đặt lại mật khẩu */}
              {accountFormData.mode === "RESET_PASSWORD" && (
                <>
                  <div className="text-xs text-slate-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Đặt lại mật khẩu cho tài khoản:{" "}
                    <span className="font-mono font-bold text-amber-950">
                      {accountModalPerson.account?.username}
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Mật khẩu mới * (tối thiểu 8 ký tự, gồm cả chữ và số)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Nhập mật khẩu mới..."
                      value={accountFormData.newPassword}
                      onChange={(e) => setAccountFormData({ ...accountFormData, newPassword: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAccountModalPerson(null)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Đang lưu..."
                    : accountFormData.mode === "CREATE"
                    ? "Tạo tài khoản"
                    : "Cập nhật mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5: THÊM BỘ PHẬN MỚI */}
      {/* ---------------------------------------------------- */}
      {showAddUnitModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Thêm Đơn vị / Bộ phận mới</h3>
            <p className="text-xs text-slate-500">
              {selectedUnit
                ? `Thêm đơn vị trực thuộc "${selectedUnit.name}"`
                : "Thêm đơn vị ở cấp cao nhất"}
            </p>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddUnit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Mã đơn vị *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: TO_GS_02"
                  value={newUnitData.code}
                  onChange={(e) => setNewUnitData({ ...newUnitData, code: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tên bộ phận / tổ *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Tổ Giám sát 2"
                  value={newUnitData.name}
                  onChange={(e) => setNewUnitData({ ...newUnitData, name: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Loại bộ phận</label>
                <select
                  value={newUnitData.type}
                  onChange={(e) => setNewUnitData({ ...newUnitData, type: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="TEAM">Tổ công tác (TEAM)</option>
                  <option value="DEPARTMENT">Bộ phận / Đội nghiệp vụ (DEPARTMENT)</option>
                  <option value="BRANCH">Chi cục (BRANCH)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Đang tạo..." : "Tạo đơn vị"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5b: ĐỔI TÊN ĐƠN VỊ */}
      {/* ---------------------------------------------------- */}
      {editingUnit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Đổi tên đơn vị</h3>
            <p className="text-xs text-slate-500">
              Mã <span className="font-mono font-semibold">{editingUnit.code}</span> giữ nguyên để bảo toàn liên kết dữ liệu.
            </p>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleRenameUnit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tên đơn vị *</label>
                <input
                  type="text"
                  required
                  value={editUnitName}
                  onChange={(e) => setEditUnitName(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUnit(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu tên mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5c: XÁC NHẬN XÓA ĐƠN VỊ */}
      {/* ---------------------------------------------------- */}
      {deletingUnit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-rose-700">Xóa đơn vị "{deletingUnit.name}"?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Chỉ xóa được đơn vị <strong>không còn</strong> đơn vị con, cán bộ, nhiệm vụ, kế hoạch và bản chốt kỳ.
              Hệ thống sẽ tự kiểm tra và từ chối nếu còn dữ liệu liên quan.
            </p>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingUnit(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteUnit}
                disabled={isSubmitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? "Đang xóa..." : "Xóa đơn vị"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5d: QUẢN LÝ CHỨC VỤ */}
      {/* ---------------------------------------------------- */}
      {showPositionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Quản lý chức vụ</h3>
              <button
                type="button"
                onClick={() => setShowPositionModal(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSavePosition} className="flex flex-col sm:flex-row gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <input
                type="text"
                required
                placeholder="Mã (VD: PHO_DOI_TRUONG)"
                value={posForm.code}
                onChange={(e) => setPosForm({ ...posForm, code: e.target.value.toUpperCase() })}
                className="flex-1 min-w-0 text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
              />
              <input
                type="text"
                required
                placeholder="Tên chức vụ (VD: Phó Đội trưởng)"
                value={posForm.title}
                onChange={(e) => setPosForm({ ...posForm, title: e.target.value })}
                className="flex-[2] min-w-0 text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50 shrink-0"
              >
                Thêm
              </button>
            </form>

            <div className="space-y-1.5">
              {positions.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-400">Chưa có chức vụ nào</div>
              )}
              {positions.map((pos) => {
                const inactive = (pos.status || "ACTIVE") === "INACTIVE";
                return (
                  <div
                    key={pos.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border ${inactive ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200"}`}
                  >
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded shrink-0">
                      {pos.code}
                    </span>
                    {editingPositionId === pos.id ? (
                      <input
                        type="text"
                        value={editPositionTitle}
                        onChange={(e) => setEditPositionTitle(e.target.value)}
                        className="flex-1 min-w-0 text-xs p-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate" title={pos.title}>
                        {pos.title}
                      </span>
                    )}
                    {inactive && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded shrink-0">
                        Ngừng dùng
                      </span>
                    )}
                    {editingPositionId === pos.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRenamePosition(pos.id)}
                          disabled={isSubmitting}
                          className="text-[11px] font-semibold text-blue-900 hover:underline shrink-0"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPositionId(null)}
                          className="text-[11px] text-slate-500 hover:underline shrink-0"
                        >
                          Hủy
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          title="Đổi tên"
                          onClick={() => {
                            setEditingPositionId(pos.id);
                            setEditPositionTitle(pos.title);
                            setModalError(null);
                          }}
                          className="p-1 rounded hover:bg-slate-100 text-slate-500 shrink-0"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={inactive ? "Kích hoạt lại" : "Ngừng dùng"}
                          onClick={() => handleTogglePosition(pos.id, !inactive)}
                          disabled={isSubmitting}
                          className="p-1 rounded hover:bg-slate-100 text-slate-500 shrink-0"
                        >
                          {inactive ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Mã chức vụ không đổi sau khi tạo. Chức vụ đang có cán bộ giữ không thể ngừng dùng.
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* DIALOG XÁC NHẬN (CONFIRM DIALOG) */}
      {/* ---------------------------------------------------- */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <h3
              className={`text-base font-bold ${
                confirmDialog.isDangerous ? "text-rose-700" : "text-slate-900"
              }`}
            >
              {confirmDialog.title}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm ${
                  confirmDialog.isDangerous
                    ? "bg-rose-700 hover:bg-rose-800"
                    : "bg-blue-900 hover:bg-blue-800"
                }`}
              >
                Xác nhận thực hiện
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
