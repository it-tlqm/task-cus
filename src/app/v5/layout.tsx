import type { Metadata } from "next";
import { V5Shell } from "@/components/v5/V5Shell";

export const metadata: Metadata = {
  title: "V5 · Trung tâm điều hành",
};

export default function V5Layout({ children }: { children: React.ReactNode }) {
  return <V5Shell>{children}</V5Shell>;
}
