import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";
import { env } from "./env";
import { track } from "./analytics/server";
import { EVENTS } from "./analytics/events";

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);

providers.push(
  Resend({
    apiKey: process.env.AUTH_RESEND_KEY || "re_missing",
    from: process.env.EMAIL_FROM || "Foothold <login@example.com>",
    async sendVerificationRequest({ identifier, url, provider }) {
      if (!process.env.AUTH_RESEND_KEY) {
        console.log(`\n[auth] Magic link for ${identifier}:\n${url}\n`);
        return;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: provider.from, to: identifier, subject: "Your Foothold sign-in link",
          text: `Sign in to Foothold:\n${url}\n\nIf you did not request this, ignore this email.`,
          html: `<p>Sign in to <strong>Foothold</strong>:</p><p><a href="${url}">${url}</a></p><p>If you did not request this, ignore this email.</p>`,
        }),
      });
      if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
    },
  }),
);

if (env.devLogin) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!email || !email.includes("@")) return null;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({ data: { email, name: email.split("@")[0], emailVerified: new Date() } });
          track(user.id, EVENTS.user_signed_up, { method: "dev-login" });
        }
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/sign-in", verifyRequest: "/sign-in?sent=1", error: "/sign-in" },
  trustHost: true,
  events: {
    createUser({ user }) { if (user.id) track(user.id, EVENTS.user_signed_up, { method: "email-or-oauth" }); },
  },
  callbacks: {
    jwt({ token, user }) { if (user?.id) token.id = user.id; return token; },
    session({ session, token }) { if (token.id) session.user.id = token.id as string; return session; },
  },
});

/** Server-side helper: current user id or redirect target. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}
