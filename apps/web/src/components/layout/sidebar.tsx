"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, FileText, UserRound, Sparkles, MessagesSquare, KanbanSquare, Users, BarChart3, Settings, Menu, Puzzle, MessageCircleQuestion, Bell, ChevronRight } from "lucide-react";
import { Wordmark } from "./wordmark";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCopilot } from "@/components/copilot/copilot-context";
import { signOutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/resumes", label: "Résumé", icon: FileText },
  { href: "/settings/profile", label: "Profile", icon: UserRound },
  { href: "#belay", label: "Belay", icon: Sparkles },
  { href: "/interview", label: "Interview", icon: MessagesSquare, badge: "NEW" },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/network", label: "Network", icon: Users },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

export function Sidebar({ user, onboarded }: { user: SessionUser; onboarded: boolean }) {
  const [open, setOpen] = useState(false);
  const content = <SidebarContent user={user} onboarded={onboarded} onNavigate={() => setOpen(false)} />;
  return (
    <>
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-screen w-[276px] shrink-0 flex-col border-r border-border/70 bg-background lg:flex" data-testid="sidebar">{content}</aside>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:hidden">
        <button aria-label="Open menu" className="focus-ring rounded-md p-2 hover:bg-accent" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        <Wordmark href={onboarded ? "/jobs" : "/onboarding"} />
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[280px] p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{content}</SheetContent>
      </Sheet>
    </>
  );
}

function SidebarContent({ user, onboarded, onNavigate }: { user: SessionUser; onboarded: boolean; onNavigate: () => void }) {
  const path = usePathname();
  const copilot = useCopilot();
  const initials = (user.name ?? user.email ?? "?").split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="px-2"><Wordmark href={onboarded ? "/jobs" : "/onboarding"} /></div>
      <nav className="mt-8 space-y-1" aria-label="Primary">
        {NAV.map((n) => {
          const active = n.href !== "#belay" && (path === n.href || (n.href !== "/" && path.startsWith(n.href) && n.href !== "/settings/profile")) || (n.href === "/settings/profile" && path === "/settings/profile");
          const Icon = n.icon;
          const cls = cn("focus-ring flex h-[46px] w-full items-center gap-3.5 rounded-xl px-3.5 text-[16px] transition-colors", active ? "bg-accent font-semibold text-foreground" : "text-foreground/85 hover:bg-accent/60", !onboarded && "pointer-events-none opacity-50");
          if (n.href === "#belay") return <button key={n.href} className={cls} onClick={() => { copilot.open(); onNavigate(); }} data-testid="nav-belay"><Icon className="h-5 w-5" />{n.label}</button>;
          return (
            <Link key={n.href} href={n.href} className={cls} onClick={onNavigate} data-testid={`nav-${n.label.toLowerCase()}`}>
              <Icon className="h-5 w-5" />{n.label}
              {n.badge && <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">{n.badge}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-4">
        <Link href="/settings/extension" onClick={onNavigate} className="focus-ring block rounded-2xl bg-[linear-gradient(135deg,oklch(0.95_0.03_45),oklch(0.93_0.035_75))] p-4 transition hover:brightness-[0.98]">
          <p className="flex items-center gap-2 text-[15px] font-semibold"><Puzzle className="h-4 w-4 text-primary" /> Apply faster <ChevronRight className="ml-auto h-4 w-4 text-muted-strong" aria-hidden /></p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-strong">Install the Chrome extension to fill Greenhouse and Lever forms from your profile.</p>
        </Link>
        <nav className="space-y-0.5">
          <Link href="/messages" onClick={onNavigate} className={cn("focus-ring flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-accent/60", path === "/messages" ? "bg-accent font-semibold" : "text-foreground/80")}><Bell className="h-5 w-5" /> Messages</Link>
          <a href="mailto:feedback@example.com?subject=Foothold%20feedback" className="focus-ring flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] text-foreground/80 hover:bg-accent/60"><MessageCircleQuestion className="h-5 w-5" /> Feedback</a>
          <Link href="/settings" onClick={onNavigate} className={cn("focus-ring flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-accent/60", path === "/settings" ? "bg-accent font-semibold" : "text-foreground/80")}><Settings className="h-5 w-5" /> Settings</Link>
        </nav>
        <div className="flex items-center gap-3 border-t pt-4">
          <Avatar className="h-9 w-9"><AvatarImage src={user.image ?? undefined} alt="" /><AvatarFallback>{initials || "?"}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user.name ?? user.email}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
          <button className="focus-ring rounded-sm text-xs text-muted-strong underline" onClick={() => signOutAction()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
