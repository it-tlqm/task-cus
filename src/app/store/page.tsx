"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3, Search, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { FilterChip } from "@/components/v5/ui/filter-bar";
import { PageHeader } from "@/components/v5/ui/page-header";
import { MiniappIcon } from "@/components/v5/miniapp-icon";
import { canDo, usePermissions, type ClientSessionUser } from "@/hooks/usePermissions";
import {
  MINIAPPS,
  MINIAPP_ACCENTS,
  MINIAPP_CATEGORIES,
  miniappCategoryLabel,
  type Miniapp,
  type MiniappCategoryId,
} from "@/config/miniapps";

const PIN_KEY = "talung.miniapps.pinned.v1";
const RECENT_KEY = "talung.miniapps.recent.v1";
const MAX_RECENT = 6;

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Trình duyệt chặn localStorage — bỏ qua, không ảnh hưởng mở app.
  }
}

function canSeeApp(app: Miniapp, user: ClientSessionUser | null): boolean {
  if (app.roles && (!user || !app.roles.includes(user.role))) return false;
  if (app.permissions && !app.permissions.some((permission) => canDo(user, permission))) return false;
  return true;
}

function AppCard({
  app,
  pinned,
  onTogglePin,
  onOpen,
}: {
  app: Miniapp;
  pinned: boolean;
  onTogglePin: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const accent = MINIAPP_ACCENTS[app.accent];
  return (
    <div
      data-testid="miniapp-card"
      data-app-id={app.id}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-v5-line bg-v5-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-v5-accent/30 hover:shadow-md"
    >
      <Link
        href={app.href}
        onClick={() => onOpen(app.id)}
        className="flex flex-1 flex-col p-4"
        aria-label={`Mở ứng dụng ${app.name}`}
      >
        <div className={`grid h-12 w-12 place-items-center rounded-xl ${accent.tile} shadow-sm`}>
          <MiniappIcon name={app.icon} className="h-6 w-6" />
        </div>

        <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-v5-ink transition-colors group-hover:text-v5-accent">
          {app.name}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[32px] text-[11.5px] leading-4 text-v5-muted">{app.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${accent.soft} ${accent.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
            {miniappCategoryLabel(app.category)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-v5-line pt-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-v5-accent">Mở ứng dụng</span>
          <ArrowUpRight className="h-4 w-4 text-v5-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onTogglePin(app.id)}
        aria-label={pinned ? `Bỏ ghim ${app.name}` : `Ghim ${app.name}`}
        aria-pressed={pinned}
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border border-transparent text-v5-muted transition-colors hover:border-v5-line hover:bg-v5-bg hover:text-v5-gold-ink"
      >
        <Star className={`h-3.5 w-3.5 ${pinned ? "fill-[#F2C41D] text-v5-gold" : ""}`} />
      </button>
    </div>
  );
}

function QuickAppLink({
  app,
  icon,
  onOpen,
}: {
  app: Miniapp;
  icon: "clock" | "pin";
  onOpen: (id: string) => void;
}) {
  const accent = MINIAPP_ACCENTS[app.accent];
  return (
    <Link
      href={app.href}
      onClick={() => onOpen(app.id)}
      className="group inline-flex items-center gap-2 rounded-lg border border-v5-line bg-v5-surface px-2.5 py-1.5 text-[11px] font-semibold text-v5-ink shadow-sm transition-colors hover:border-v5-accent/30 hover:bg-v5-bg"
    >
      <span className={`grid h-5 w-5 place-items-center rounded ${accent.soft} ${accent.text}`}>
        <MiniappIcon name={app.icon} className="h-3 w-3" />
      </span>
      <span className="max-w-[180px] truncate">{app.name}</span>
      {icon === "clock" ? (
        <Clock3 className="h-3 w-3 text-v5-muted" />
      ) : (
        <Star className="h-3 w-3 fill-[#F2C41D] text-v5-gold" />
      )}
      <ArrowUpRight className="h-3 w-3 text-v5-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function StorePage() {
  const { user, loading } = usePermissions();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | MiniappCategoryId>("all");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPinnedIds(readIds(PIN_KEY));
    setRecentIds(readIds(RECENT_KEY));
    setMounted(true);
  }, []);

  const visibleApps = useMemo(
    () => MINIAPPS.filter((app) => canSeeApp(app, (user as ClientSessionUser | null) || null)),
    [user]
  );

  const byId = useMemo(() => new Map(visibleApps.map((app) => [app.id, app])), [visibleApps]);
  const pinnedApps = useMemo(
    () => (mounted ? pinnedIds.map((id) => byId.get(id)).filter((app): app is Miniapp => !!app) : []),
    [mounted, pinnedIds, byId]
  );
  const recentApps = useMemo(
    () => (mounted ? recentIds.map((id) => byId.get(id)).filter((app): app is Miniapp => !!app) : []),
    [mounted, recentIds, byId]
  );

  const rememberRecent = (id: string) => {
    setRecentIds((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, MAX_RECENT);
      writeIds(RECENT_KEY, next);
      return next;
    });
  };

  const togglePin = (id: string) => {
    setPinnedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeIds(PIN_KEY, next);
      return next;
    });
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredApps = useMemo(() => {
    return visibleApps.filter((app) => {
      if (category !== "all" && app.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = [app.name, app.description, ...app.keywords].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [visibleApps, category, normalizedQuery]);

  const groups = useMemo(() => {
    return MINIAPP_CATEGORIES.map((item) => ({
      ...item,
      apps: filteredApps.filter((app) => app.category === item.id),
    })).filter((group) => group.apps.length > 0);
  }, [filteredApps]);

  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of visibleApps) counts.set(app.category, (counts.get(app.category) || 0) + 1);
    return counts;
  }, [visibleApps]);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        eyebrow="Không gian nghiệp vụ"
        title="Kho ứng dụng"
        badges={
          <Badge variant="outline">
            {loading ? "Đang tải quyền…" : `${visibleApps.length} ứng dụng`}
          </Badge>
        }
        description="Mỗi nghiệp vụ là một ứng dụng riêng. Mở đúng việc cần làm, không phải nhớ menu."
      />

      <div className="flex flex-col gap-3 rounded-xl border border-v5-line bg-v5-surface p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v5-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm ứng dụng, ví dụ: giao ban, báo cáo, nhân sự…"
            aria-label="Tìm ứng dụng"
            className="h-10 w-full rounded-lg border border-v5-line bg-v5-bg pl-9 pr-3 text-sm text-v5-ink outline-none transition-colors placeholder:text-v5-muted focus:border-v5-accent focus:bg-v5-surface"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
            Tất cả ({visibleApps.length})
          </FilterChip>
          {MINIAPP_CATEGORIES.map((item) => (
            <FilterChip
              key={item.id}
              active={category === item.id}
              onClick={() => setCategory(item.id)}
              disabled={!countByCategory.get(item.id)}
            >
              {item.label} ({countByCategory.get(item.id) || 0})
            </FilterChip>
          ))}
        </div>
      </div>

      {mounted && (pinnedApps.length > 0 || recentApps.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {pinnedApps.length > 0 && (
            <section aria-label="Ứng dụng đã ghim" className="rounded-xl border border-v5-line bg-v5-surface p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-v5-muted">
                <Star className="h-3 w-3 fill-[#F2C41D] text-v5-gold" /> Đã ghim
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pinnedApps.map((app) => (
                  <QuickAppLink key={app.id} app={app} icon="pin" onOpen={rememberRecent} />
                ))}
              </div>
            </section>
          )}
          {recentApps.length > 0 && (
            <section aria-label="Ứng dụng dùng gần đây" className="rounded-xl border border-v5-line bg-v5-surface p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-v5-muted">
                <Clock3 className="h-3 w-3" /> Dùng gần đây
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentApps.map((app) => (
                  <QuickAppLink key={app.id} app={app} icon="clock" onOpen={rememberRecent} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-v5-line bg-v5-surface p-10 text-center">
          <Search className="mx-auto h-6 w-6 text-v5-muted" />
          <div className="mt-2 text-sm font-semibold text-v5-ink">Không tìm thấy ứng dụng phù hợp</div>
          <div className="mt-1 text-[11px] text-v5-muted">Thử từ khóa khác hoặc chọn nhóm khác.</div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-label={`Nhóm ${group.label}`}>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold text-v5-ink">{group.label}</h2>
                <p className="text-[10.5px] text-v5-muted">{group.description}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">
                {group.apps.length} ứng dụng
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.apps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  pinned={pinnedIds.includes(app.id)}
                  onTogglePin={togglePin}
                  onOpen={rememberRecent}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <div className="flex items-start gap-2 rounded-lg border border-v5-line bg-v5-bg px-3 py-2.5 text-[10.5px] text-v5-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-v5-success" />
        <span>
          Ứng dụng hiển thị theo quyền của tài khoản. Cần thêm quyền, liên hệ quản trị hệ thống. Ghim và lịch sử
          dùng gần đây chỉ lưu trên máy này.
        </span>
      </div>
    </div>
  );
}
