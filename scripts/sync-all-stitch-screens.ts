import fs from "fs";
import path from "path";

// 16 màn hình UI chính xác từ Stitch list_screens
const SCREENS = [
  // 7 Desktop Screens
  {
    id: "089086aec3864b019c5af41b1319cf82",
    title: "Dashboard Lãnh Đạo Điều Hành",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UgjP0_xgPENfhTU7K7HFpfAtOLOS6jg3mew7oWATTbRHGui16axVNrGgBfHA-muSMRdXmlEHC6yPtJtNX0eAnpENwj4valeqgDUM_vATxzIyvu1vn65FPYFkBrFH7rp_pfDzCvUW-lhnetVbZNhB-chGrAC-K5hO8R51wHUz24qc_nsHCYrPLfyA3Lifbl-SSiMB1chDsfPXgKV4F6h1bz_XoM-2O599reORtJ4RLrMs9kTEXUnoKxzPA",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNTQ4ZmY2YzgwNzc5ODM4Y2FmMmQ4MDAxEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "d8279bd2bf0c4198b665f567223d0bf4",
    title: "Kế Hoạch Công Tác Tuần",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WfIy4Qgxzr2tgW5Kz9hG-DzOfROVuNFPXOOfYAlVeMMZl4VW_y2_tScHRd3IFSEokxIjdPwttfUMFUSEb_rdKG87k9xEKFo7YvYk8YYqFPx_8IM9I-R7g9ifDofWLFRRig85maXKeJEfXRT2zpkGv2vg7YkvgGg2sTW3v-JjHAQn-ptE25eR-_S7j_7FV2iZTzPI4KpTmiyiPy6nvouppOfJioRc1X_h0iy7iSmWH-a20fU8MEOyQIOQ",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNTRlNjBlYzkwOTEwNGY0ZTgxMzJlZDc4EgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "a1afd1c794c6454a8e161b43f25f4024",
    title: "Công Việc Của Tôi",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UeRzSzJ6ssKgb7LqsZVMn41Ss1453Ma8divLDTLpDbJu5DuiYH88vFrndbooMLnlVy_Y2Bmi1ez7G4q11r9HfHMbT0QJcgpkx5K-5khHEV7vnHfXYdTRmL_jgATbXxQQkryspJKS7yMaA2WIu3zk95mbLNIKSOJpM--NqjuXPXUqCxZbpKugGdp3ZcuSXPzj8iCM6qqq4LQmvjpxTbJmvXk1xYCPcoz5gWdgD_aTtNmuJJoJ-rmJRXnYI",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNjQ0NjRmZTQwMjJkNTc1NjlkMTljMWNjEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "26cca4106e7047f0af538a76d53f9338",
    title: "Nhiệm Vụ Chỉ Đạo & Giao Việc",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UhErsg5A1Kwpq-F2KYKo9rfC5W28cirpmequf_F5RLBhlNfutq8uJZexgQVVuAxu8ji4UqGICHC6yUgb7xNIrZ6lAJzq7l6eMy5yA1Ca8ZHX8rnwfqXw3NmKG7f_9GcbuPzXRSRgRPRgMIRf1_RtEgr0PqDtnG7LdpsCXipYCGwEegXgvAZJAiWr-21WtavK4Os2ux8RUlLQUbQDr4T6tTPuO82OKC74TiwiN0B7T55be9JPxUm_VilA",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNjQyY2NhNmQwNzc5ODM4Y2FmMmQ4MDAxEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "6c85595ba47745ae9075391d1e280f87",
    title: "Nhật Ký Tác Nghiệp & Biểu Mẫu Động",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WmG8omFJatdGoeHyd_AsSeDplYjmwjJTy0i52OjC-R7KsRTSXQF8qjDAPoL7-PmmigTPOIYbBK8FSraoJno7ct3MdDGR-YOn2PaEyn8ORWkaivJZjv_wwzySUzMEwVqPdh7aYirDLkU0eR4Nf1ZSkeRGqxB8gEFCDlZilkGqWVOa9iHtcCjUkD5ysBpDVAe8t6ZWeg1ke6hnzUvgTAm3CfCyzXjXVzAXp7lQiliDLls2f5gDdY5dEvl1M",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNjQ4NTJlYjUwODlhZjcyNjIyMTdmZjQ5EgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "a4e5421378a643b8a65a7ec5600b17aa",
    title: "Báo Cáo Trực Tuyến & Cấu Hình Mẫu XLSX",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XwxBDJRwCJl-bbRUfGcr8BhmnNa8sZu--IokyBdrxwVjQsT_Unlrygke5Dx2NKB57bC2vBcdsUOBJwzdkZVxAlsA9suS-niLFJYghihMBLQcJNnqH2OGGTsoKYoknPFYu37V0paAXkPZZoeJwEXP1gqCgtE2FYfaRvjPxVXMMvie6cOF-gx3RHGg40U9-GgtfmD9fhSeQJe1qZPefcB8HlYZe8uHjC_6VdgA2v1KYjm0BfFNYfg6w1Pw",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNjcwNjM1YWUwNTAzYzFmOGQzMTdmYTIyEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "25d2bbef1eed4a3bb5aef7fcee376979",
    title: "Quản Trị Hệ Thống & Cấu Hình",
    device: "DESKTOP",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XUJBJm2F4HwvCvZFxR1fyF6W-v78gSeRxhaNoSXtW7Fea0Rmn1Kx5m9BO6EhPVB4NUqB5YHmf8qW-pAXHO1Gq_VzfLX3jzztXvj_Lgkzu2hCFaj7ezGyt-r9CQE5l59DVhvW3jGyD5rsDiT3y8Da3YNnSdOmmL4n6LscUwalVaU7jSj60ePBhnc6Oy-cdvUPo4P-zrPYx58P4Arph5WLjqks2jpNmNz6hYXLacOGh_gNo31RAhoh4QFg",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNTM2MWZkY2UwNTc2MzE3MmVkMTExM2YyEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },

  // 9 Mobile Screens (390px Viewport)
  {
    id: "6de0e0a4a10f429b9af634b4709465ea",
    title: "Đăng Nhập Hệ Thống (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XJnVtvrmUZDYroryrDbzPSLu4Z4BArF7XMC6rJcatUKqwPnvv2rNzJIY6Fu_rzuqOWzcJJVQx9zlYt9J8KSy-YVtHHpBlab93Suun2KgSmnurBCkYpj0uO2cT6GKBc9VUgH7R8g42BwV_Pnhfv4iOzPTZargVETW15Vfs5WFuJhT6dMVnN90YYVE3kNdTroNEFaDHEmV3hCrbGCFUKhAuPyStK6CID0tRUDxU_3Xh87hf6EdOVwWs5iiw",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxOGJiMDc3MWMwNjM5NzVjZDI0MWI4NmZiEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "e603607363fd424d95c1e47d9bf41a5a",
    title: "Dashboard Điều Hành (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UgUJTtW6mYDYLGtGDDJ4RGByB9C9FCaJkD-ugrI97SVy6QIKVqEtTiwwtTGkHFh6RVgWYkngHUud6rCWvhDHqsdDNTwbyPzTaf-uH7b7c-wJ61lePk6xx4JYHMpnR26Bqcm1TIzKrLsPiTDYZe7rTYAUkIt7ny_l6ZEh8HtAMP9ip6yU28VyKiRkOxXc367W53rgaQ3TvN28NrPXe2ofyLDJLb-ddIvuddgtVEW9gx-N9XGCSVTc2UTCU",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxOGI5YzM0MmEwMWVlNjkyMzA2MWJkNGJjEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "6835e08c233044cebdd3c966fef7fb1e",
    title: "Kế Hoạch Công Tác (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1Xaz5ygyr5PcCA92OiVcbdgQgmmO8rkzQvHVVNfkli5gH_EVIJObeJCCabt99vLEDCb8UL90IqEU9W67fqQMdN9eBric-iYxdqiNPo5xOK9GuYLwt7_T4K9NL9hsRYXmfgrtSBX19TZI_6ev5pWN8RDgn0_aX0rci10K5_Mtj1fyDLZg-fwLol9Qh432hTy2_fRxew0gLg_cqT_yqqnYLvkLH_Mg3XEiao6K_GVX1qn54yPuAjDHfoiILA",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxOGNmZTllZWIwOTI1YzdlMWEyMWYzY2VhEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "76ee03a9efeb4a9a8c27ab0ddcaf0283",
    title: "Phê Duyệt Lãnh Đạo (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VyuwKJPbA0yz456qtyjsTh9XwYlAdGk9QFQqsD6o3aT9WMTs0qzExNa44C-G5P5VOdOMd3uO8feEN41EUWpLE939ab8okmvCrUR6Lb15rFoTkGgSrRzUGUA0Tgi487kqd-Yx4iC98U1KmFpslaxgCjGhqfgS-fd65dGNdYh4uAxETxPO-AigbElTi86VSbeXmv-Jdznd6_sKthL6w-gLoGWrjx9_hoGQdiKjxXWYZTX1cVEbGFrNRNcwM",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxOGM5MDViMWEwNWMyZmM1MWQyMTFlYmQwEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "2443cdf63e214979b5a74c40779511ba",
    title: "Công Việc Của Tôi (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1Xds-mpoTNJdfelY0U-Uq8StoXtYNFCpukvQcN8ku5G4QevIjx83X-s5fQe4F2wvXWakIImXPW0JpH7ZGEyISGUai7RHskiOOnhqnrVm4Fs-aodOMwGULYCtKNCmIp_WefgYTIr6AEzIorZ5_QrrG0ElN3ciy6tmjWrAqlBodPL6cgfCcohY8fy5LQQI5-6F5lDIobnk6gxy_CE_e2ttQMYsqhIR8Z8vO3TMivwQp_YfRauvw3ULhPjhw",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNzdkMzUwNTIwNTIyOWQ1ODc5MzE5NTYwEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "453d42cded034a6b807f9d88dcb5548d",
    title: "Chi Tiết Nhiệm Vụ (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UbLWFG0bhbMBMgSP0_XMC6tRAkhSj23orsS9Y-iPwx7pcHnkrBWNP-m5zNGVXmgs5pp6sBnk5gme6uAN_Xsei8ArcCLXiN2IGT_C5WK175YLh-k4fYmTKcD4c5V1r03vM1x2XYzRVQESNMShg-udYrpSppO1k9eOjEsX7fT4yFpW7OAg0R5QTHpGqrmc-yJpc2IROZwio2EJRkD5NrzSiRTkea4B2oQcwdfyr2zZiv7tjmGzxsW9iioEo",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNzgzYTM1ZTQwODlhZjcyNjIyMTdmZjQ5EgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "a82b540bccfa44f18a4613e415e5efa4",
    title: "Nhật Ký Tác Nghiệp (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XB1ILgUjS3bCNFupQFE2AAhDzJUFS1dH8ejuBsxeyfsPxkCVyPBpkU868xSAlt6wY4GsPF0G5aS-7_2t5om1o6kuGob8XpGEEI9SEFRhuJ4EXBuSBxcq8wgMU_33QsiWxrKepw5r0JIGGlI-Q5rEcQjIjWwBYQWmrJmIWrw5g785CsMstg-2vPVN8HcclR5FmmgXyzrakssOXMrfqs9Q7Ub0mPAQXKvmkMtEbSPxnYGnj3N0EiA2Lj3XU",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxNzc0NjYzN2MwMWE2MGJmNTA0MmFkODgzEgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "7b483d3d95784cad9377ed26e2e6fd08",
    title: "Báo Cáo Trực Tuyến (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VSZOGfJzBnpJAEGi_1iRtKxDpDxFm_Pqpigkf-Pf1saN2d3htXw2tOxWlsqhi_SHUfHiE1bZSSL4G17BkbfWXqUsEb9lXzzd9PMMf2Nkx1-_vZ-f0A3QhYPmQz1eg6I6sm_ndpBPl4olli-PoHmajrRuZvNri1w-nE-seoHTt4u8IfRGbvYSFRo0CcBCKf3T9DNXJtHqJZIwYWbchQqMMPQVkCYaO80t1onZ2kaY6_vD1iaRTnoc0MnA",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxOGJmYmM3ODgwOTEwNGY0ZTgxMzJlZDc4EgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
  {
    id: "cf3acf4ac7ce43edbb7642ce7bf521a9",
    title: "Thông Báo Điều Hành (Mobile)",
    device: "MOBILE",
    screenshotUrl: "https://lh3.googleusercontent.com/aida/AEtjO1Um6uwJOJQzIWXacKMTDeI6wbWylKSKFq2GW82KkK7JNWfwEmMUKh-_I8ISaZ2LBhJb7WwgPWQX1nPgANj3F_O9jgTsI0LMDbSRR_-G4CUFRqpmiPFRMigfUtDKY7sPPxrNv9XcPdR_pTnXabonwx7QPwu0se0GgP6_-7-KAUEQBGgdS_gqbtD7fVfD1oEjAVgDB0SLAEt2F7EmQg2J0fNVh5Luazybp5O72XfWX85I1Zz3kEULEmop0Pk",
    htmlUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZDYxOGM1M2E5NDEwNjM5NzQ4M2M0MDg3M2Q3EgsSBxCor6vhuB8YAZIBIwoKcHJvamVjdF9pZBIVQhMxNzA2MjI5MDE5MTIyNjY0NDYz&filename=&opi=89354086",
  },
];

const TARGET_DIR = path.resolve("docs/stitch-export");

async function downloadFile(url: string, destPath: string) {
  if (fs.existsSync(destPath)) {
    // console.log(`  File exists: ${path.basename(destPath)}`);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`  ✓ Đã tải: ${path.basename(destPath)} (${buffer.length} bytes)`);
  } catch (err: any) {
    console.error(`  ✗ Lỗi tải ${path.basename(destPath)}:`, err.message);
  }
}

async function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  console.log("=========================================================");
  console.log(" ĐỒNG BỘ ĐẦY ĐỦ 16 MÀN HÌNH TỪ GOOGLE STITCH MCP         ");
  console.log(` Thư mục đích: ${TARGET_DIR}`);
  console.log("=========================================================\n");

  for (const s of SCREENS) {
    const sanitizedTitle = s.title.replace(/[\/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
    const prefix = `${s.id}_${sanitizedTitle}`;
    const htmlPath = path.join(TARGET_DIR, `${prefix}.html`);
    const pngPath = path.join(TARGET_DIR, `${prefix}.png`);

    console.log(`\n[${s.device}] ${s.title} (ID: ${s.id})`);
    if (s.htmlUrl) await downloadFile(s.htmlUrl, htmlPath);
    if (s.screenshotUrl) await downloadFile(s.screenshotUrl, pngPath);
  }

  console.log("\n---------------------------------------------------------");
  console.log("Hoàn thành đồng bộ tài nguyên 16 màn hình Stitch!");
  console.log("---------------------------------------------------------");
}

main();
