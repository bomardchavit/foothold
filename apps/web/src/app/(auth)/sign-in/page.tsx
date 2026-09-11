import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/session";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  if (await currentUser()) redirect("/feed");
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/feed";
  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  async function emailAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    try { await signIn("resend", { email, redirectTo: next }); }
    catch (e) { if (e instanceof AuthError) redirect(`/sign-in?error=${encodeURIComponent(e.type)}`); throw e; }
  }
  async function googleAction() { "use server"; await signIn("google", { redirectTo: next }); }
  async function devAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    try { await signIn("dev-login", { email, redirectTo: next }); }
    catch (e) { if (e instanceof AuthError) redirect(`/sign-in?error=${encodeURIComponent(e.type)}`); throw e; }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Wordmark className="mb-10" />
      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">We will email you a one-time link. No passwords.</p>
      {sp.sent && <p className="mt-4 rounded-md border border-primary/40 bg-accent p-3 text-sm">Check your inbox for the sign-in link.{!process.env.AUTH_RESEND_KEY && " (No email provider configured: the link was printed in the server console.)"}</p>}
      {sp.error && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Sign-in failed ({sp.error}). Try again.</p>}
      <form action={emailAction} className="mt-6 space-y-3">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
        <Button type="submit" className="w-full">Email me a link</Button>
      </form>
      {hasGoogle && (
        <form action={googleAction} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
        </form>
      )}
      {env.devLogin && (
        <>
          <Separator className="my-8" />
          <form action={devAction} className="space-y-3 rounded-lg border border-dashed p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Development login</p>
            <p className="text-xs text-muted-foreground">Enabled by DEV_LOGIN=true. Creates the account if it does not exist. Try <code>demo@foothold.local</code> for the seeded profile.</p>
            <Input name="email" type="email" required defaultValue="demo@foothold.local" data-testid="dev-email" />
            <Button type="submit" variant="secondary" className="w-full" data-testid="dev-login">Sign in without email</Button>
          </form>
        </>
      )}
    </main>
  );
}
