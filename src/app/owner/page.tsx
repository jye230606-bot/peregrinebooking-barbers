import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { tenant } from "@/config/tenant";

/** Old owner bookmarks now lead to the shared diary Vance signs into. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Owner · ${tenant.name}`,
  robots: { index: false, follow: false },
};

export default function OwnerPage() {
  redirect(`https://www.peregrineoffice.space/console/shop/${tenant.slug}`);
}
