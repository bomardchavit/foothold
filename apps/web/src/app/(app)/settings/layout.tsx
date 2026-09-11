import { SettingsNav } from "@/components/settings/settings-nav";
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl"><h1 className="mb-4 text-3xl">Settings</h1><SettingsNav />{children}</div>;
}
