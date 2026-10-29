import { redirect } from "next/navigation";

/** Sản phẩm QĐ1277 đã gộp vào Danh mục & sản phẩm. */
export default function ProductsPage() {
  redirect("/admin/catalog?tab=products");
}
