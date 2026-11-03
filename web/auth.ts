import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isKeeper } from "@/lib/keeper";

// Google sign-in, limited to the Keeper's verified email (KEEPER_EMAIL).
// Sessions are signed, encrypted cookies (AUTH_SECRET); no user table is needed for one person.
// Every page and API route re-checks the email against KEEPER_EMAIL (lib/session.ts), so
// changing KEEPER_EMAIL locks out an existing session at once.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ profile }) {
      return isKeeper(profile?.email, profile?.email_verified as boolean | undefined);
    },
  },
});
