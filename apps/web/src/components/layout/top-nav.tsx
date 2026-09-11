"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./wordmark";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot/copilot-context";
import { signOutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/feed", label: "Matches" },
  { href: "/resumes", label: "Résumés" },
  { href: "/tracker", label: "Tracker" },
  { href: "/network", label: "Network" },
  { href: "/insights", label: "Insights" },
];

export function TopNav({ user, onboarded }: { user: SessionUser; onboarded: boolean }) {
  const path = usePathname();
  const copilot = useCopilot();
  const initials = (user.name ?? user.email ?? "?").split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Wordmark href={onboarded ? "/feed" : "/onboarding"} />
        {onboarded && (
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent", path.startsWith(n.href) ? "bg-accent font-medium text-foreground" : "text-muted-foreground")}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onboarded && (
            <Button variant="outline" size="sm" onClick={() => copilot.open()} data-testid="open-copilot">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" /> Ask Belay
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
                <Avatar className="h-8 w-8"><AvatarImage src={user.image ?? undefined} alt="" /><AvatarFallback>{initials || "?"}</AvatarFallback></Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {onboarded && NAV.map((n) => <DropdownMenuItem key={n.href} asChild className="md:hidden"><Link href={n.href}>{n.label}</Link></DropdownMenuItem>)}
              <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/settings/profile">Edit profile</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => signOutAction()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
