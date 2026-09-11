import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Wordmark className="mb-10" />
      <h1 className="text-3xl">Page not found</h1>
      <p className="mt-2 text-muted-foreground">Nothing lives at this address.</p>
      <Button asChild className="mt-6 w-fit" size="lg"><Link href="/jobs">Go to jobs</Link></Button>
    </main>
  );
}
