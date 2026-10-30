"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/v5/ui/card";

interface Metric {
  id: string;
  code: string;
  name: string;
  displayScale?: number;
  decimals?: number;
  unitLabel?: string;
  cols: Record<string, number | null>;
  classCols?: Array<{ classificationId: string; label: string; cols: Record<string, number | null> }>;
}

function toTy(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round((value / 1_000_000_000) * 10) / 10;
}

function shortNumber(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
}

export function RevenueCharts({ metrics, comparison }: { metrics: Metric[]; comparison?: any }) {
  const tax = metrics.find((metric) => metric.code === "THU_NSNN");
  const row = comparison?.rows?.[0];

  const comparisonData = [
    { name: "Kỳ này", value: toTy(row?.monthCum) },
    { name: "Tháng trước", value: toTy(row?.prevMonth?.value) },
    { name: "Cùng kỳ", value: toTy(row?.samePeriodLastYear?.value) },
    { name: "Chỉ tiêu", value: toTy(row?.monthPlan?.targetValue) },
  ].filter((item) => item.value !== null);

  const classData = (tax?.classCols || []).map((item) => ({
    name: item.label,
    month: toTy(item.cols.month),
    year: toTy(item.cols.year),
  }));
  const pieData = classData.filter((item) => item.month !== null && item.month > 0);

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>So sánh số thu</CardTitle>
          <CardDescription>Kỳ này, tháng trước, cùng kỳ và chỉ tiêu · đơn vị tỷ đồng</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            {comparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--v5-line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--v5-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => `${value}`} tick={{ fontSize: 10, fill: "var(--v5-muted)" }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip formatter={(value: any) => shortNumber(Number(value))} />
                  <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                    {comparisonData.map((_, index) => (
                      <Cell key={index} fill={index === 3 ? "var(--v5-gold)" : index === 0 ? "var(--v5-accent)" : "var(--v5-muted)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-xs text-v5-muted">Chưa có dữ liệu so sánh</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thu theo phân loại</CardTitle>
          <CardDescription>Lũy kế tháng và lũy kế năm · đơn vị tỷ đồng</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            {classData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--v5-line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--v5-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--v5-muted)" }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip formatter={(value: any) => shortNumber(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="month" name="Lũy kế tháng" fill="var(--v5-accent)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="year" name="Lũy kế năm" fill="var(--v5-gold)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-xs text-v5-muted">Chưa có phân loại</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cơ cấu thuế tháng</CardTitle>
          <CardDescription>Tỷ trọng các loại hàng trong lũy kế tháng</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="month"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={86}
                    paddingAngle={2}
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={index}
                        fill={["var(--v5-accent)", "var(--v5-danger)", "var(--v5-gold)", "var(--v5-muted)", "var(--v5-success)"][index % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => shortNumber(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-xs text-v5-muted">Chưa có dữ liệu tháng</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
