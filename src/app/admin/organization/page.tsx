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
  RefreshCw,
  FolderTree,
  UserCheck,
  Mail,
  Phone,
} from "lucide-react";

interface OrgUnit {
  id: string;
  code: string;
  name: string;
  type: string;
  orderIndex: number;
  isActive: boolean;
  parentId?: string | null;
  children?: OrgUnit[];
  _count?: { people: number };
}

interface Person {
  id: string;
  code: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  position: string;
  isActive: boolean;
  orgUnit?: { id: string; name: string; code: string };
  account?: { id: string; username: string; role: string; isActive: boolean };
}

export default function OrganizationAdminPage() {
  const [orgTree, setOrgTree] = useState<OrgUnit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<OrgUnit | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchPerson, setSearchPerson] = useState("");
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitData, setNewUnitData] = useState({ code: "", name: "", type: "TEAM" });
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch Tree & People
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resTree, resPeople] = await Promise.all([
        fetch("/api/org-units/tree"),
        fetch("/api/people"),
      ]);

      if (resTree.ok) {
        const json = await resTree.json();
        const treeData: OrgUnit[] = Array.isArray(json) ? json : (json.data || []);
        setOrgTree(treeData);
        // Expand root by default
        const initialExpanded: Record<string, boolean> = {};
        const walk = (nodes: OrgUnit[]) => {
          nodes.forEach((n) => {
            initialExpanded[n.id] = true;
            if (n.children) walk(n.children);
          });
        };
        walk(treeData);
        setExpandedNodes(initialExpanded);

        // Select root by default if available
        if (treeData.length > 0 && !selectedUnit) {
          setSelectedUnit(treeData[0]);
        }
      }

      if (resPeople.ok) {
        const json = await resPeople.json();
        const peopleList: Person[] = Array.isArray(json) ? json : (json.data || []);
        setPeople(peopleList);
      }
    } catch (err) {
      console.error("Error fetching org data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitData.code || !newUnitData.name) return;

    try {
      const res = await fetch("/api/org-units/tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newUnitData,
          parentId: selectedUnit?.id || null,
        }),
      });

      if (res.ok) {
        setShowAddUnitModal(false);
        setNewUnitData({ code: "", name: "", type: "TEAM" });
        setActionMessage("Đã thêm đơn vị/bộ phận mới thành công");
        fetchData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err) {
      console.error("Add unit error:", err);
    }
  };

  // Filter people by selected unit or all
  const filteredPeople = people.filter((p) => {
    const matchesUnit = selectedUnit ? p.orgUnit?.id === selectedUnit.id : true;
    const matchesSearch =
      p.fullName.toLowerCase().includes(searchPerson.toLowerCase()) ||
      p.code.toLowerCase().includes(searchPerson.toLowerCase()) ||
      p.position.toLowerCase().includes(searchPerson.toLowerCase());
    return (selectedUnit ? matchesUnit : true) && matchesSearch;
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
              ? "bg-blue-900 text-white font-semibold"
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
            {node._count && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? "bg-amber-400 text-blue-950 font-bold" : "bg-slate-200 text-slate-700"
                }`}
              >
                {node._count.people}
              </span>
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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">
              Quản trị hệ thống
            </span>
            <span className="text-xs text-slate-500">Màn hình S07 • Split Pane 35/65</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Cơ cấu tổ chức & Quản lý nhân sự</h1>
          <p className="text-sm text-slate-600">
            Quản trị sơ đồ tổ chức linh hoạt không hard-code, danh sách công chức và phân quyền tài khoản
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <button
            onClick={() => setShowAddUnitModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm bộ phận
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-600 hover:underline text-xs">
            Đóng
          </button>
        </div>
      )}

      {/* Split-pane container (35% Left Tree, 65% Right People list) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane (35% ~ 4-5 cols on 12 col grid): Recursive Org Tree */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <FolderTree className="w-4 h-4 text-blue-900" />
              Sơ đồ đơn vị
            </div>
            <button
              onClick={() => setSelectedUnit(null)}
              className="text-xs text-blue-700 hover:underline font-medium"
            >
              Xem tất cả
            </button>
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-xs text-slate-400">Đang tải sơ đồ tổ chức...</div>
            ) : orgTree.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">Chưa có dữ liệu đơn vị</div>
            ) : (
              orgTree.map((node) => renderTreeNode(node, 0))
            )}
          </div>
        </div>

        {/* Right Pane (65% ~ 8 cols): Personnel List in Unit */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-900" />
                {selectedUnit ? selectedUnit.name : "Tất cả công chức trong đơn vị"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedUnit
                  ? `Mã: ${selectedUnit.code} • Loại: ${selectedUnit.type}`
                  : "Toàn bộ nhân sự tại Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng"}
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên, mã, chức vụ..."
                value={searchPerson}
                onChange={(e) => setSearchPerson(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Personnel Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Mã CC</th>
                  <th className="py-2.5 px-3">Họ và tên</th>
                  <th className="py-2.5 px-3">Chức vụ</th>
                  <th className="py-2.5 px-3">Bộ phận</th>
                  <th className="py-2.5 px-3">Tài khoản & Vai trò</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Không tìm thấy công chức nào phù hợp
                    </td>
                  </tr>
                ) : (
                  filteredPeople.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-medium text-blue-950">{p.code}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{p.fullName}</div>
                        {p.email && <div className="text-[11px] text-slate-400">{p.email}</div>}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-700">{p.position}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {p.orgUnit ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                            {p.orgUnit.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {p.account ? (
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-blue-600" />
                            <span className="font-mono text-slate-800">{p.account.username}</span>
                            <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-semibold">
                              {p.account.role}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chưa tạo tài khoản</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Hoạt động
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Thêm bộ phận mới */}
      {showAddUnitModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Thêm Đơn vị / Bộ phận mới
            </h3>
            <p className="text-xs text-slate-500">
              {selectedUnit
                ? `Thêm đơn vị trực thuộc "${selectedUnit.name}"`
                : "Thêm đơn vị ở cấp cao nhất"}
            </p>

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
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm"
                >
                  Tạo đơn vị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
