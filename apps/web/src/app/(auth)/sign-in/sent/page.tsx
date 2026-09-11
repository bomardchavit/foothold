import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Check your inbox" };

/** Auth.js verifyRequest page: a dedicated route so the provider/type query string it appends never mangles a banner flag. */
export default function SignInSentPage() {
  const noProvider = !process.env.AUTH_RESEND_KEY;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Wordmark className="mb-10" />
      <h1 className="text-3xl">Check your inbox</h1>
      <p className="mt-2 text-sm text-muted-foreground">We sent you a one-time sign-in link. It expires in 24 hours and works once.</p>
      {noProvider && <p className="mt-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">No email provider is configured, so the link was printed in the server console instead.</p>}
      <Button asChild variant="outline" className="mt-6 w-fit"><Link href="/sign-in">Use a different email</Link></Button>
    </main>
  );
}
