import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader, PAGE_CONTAINER } from "@/components/layout/page-header";
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className={PAGE_CONTAINER}><PageHeader className="mb-4" title="Settings" /><SettingsNav /><div className="max-w-4xl">{children}</div></div>;
}
