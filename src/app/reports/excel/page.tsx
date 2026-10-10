import { redirect } from "next/navigation";

export default function ReportsExcelPage() {
  redirect("/reports?tab=builder");
}
