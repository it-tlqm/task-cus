import { redirect } from "next/navigation";

export default function ReportsSnapshotsPage() {
  redirect("/reports?tab=snapshots");
}
