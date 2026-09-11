import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";

export default async function Landing() {
  if (await currentUser()) redirect("/feed");
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Wordmark />
        <Button asChild variant="outline"><Link href="/sign-in">Sign in</Link></Button>
      </header>
      <section className="grid flex-1 items-center gap-12 py-12 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-primary">Job search, with the reasoning shown</p>
          <h1 className="text-5xl leading-[1.05] md:text-6xl">Find your footing in the job search.</h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Upload a résumé, answer a few questions, and get ranked roles with a fit breakdown you can interrogate. Ask the copilot why you match, tailor your résumé for each posting, and track every application in one place.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg"><Link href="/sign-in">Get started</Link></Button>
            <Button asChild size="lg" variant="ghost"><a href="#how">How it works</a></Button>
          </div>
        </div>
        <ul className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          {[
            ["Fit bar, not a black box", "Six scored components. Every number comes with the evidence behind it."],
            ["Belay, the grounded copilot", "Every claim about you cites a line from your profile or the posting."],
            ["Résumés tailored per role", "Best-fit rewrites with a diff view. Additions are labeled so you decide what is true."],
            ["Tracker and autofill", "A kanban for applications and a Chrome extension that fills Greenhouse and Lever forms. You press submit."],
          ].map(([t, d]) => (
            <li key={t} className="border-l-2 border-primary pl-4">
              <p className="font-medium">{t}</p>
              <p className="text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
      </section>
      <section id="how" className="grid gap-6 border-t py-12 md:grid-cols-3">
        {[
          ["1. Profile", "PDF or DOCX in, structured profile out. Edit anything the parser got wrong."],
          ["2. Matches", "Jobs from public ATS boards and a seed dataset, scored against your profile with filters for remote, seniority, salary and sponsorship."],
          ["3. Apply", "Tailor, export, track. The product prepares; you apply."],
        ].map(([t, d]) => (
          <div key={t}><h3 className="text-xl">{t}</h3><p className="mt-2 text-sm text-muted-foreground">{d}</p></div>
        ))}
      </section>
      <footer className="py-8 text-xs text-muted-foreground">Foothold · Jobs from public APIs and your own data only.</footer>
    </main>
  );
}
