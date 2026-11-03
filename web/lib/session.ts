import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { keeperEmail } from "@/lib/keeper";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function signedInKeeper(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const keeper = keeperEmail();
  return email && keeper && email === keeper ? email : null;
}

/** For pages: sends anyone who isn't the signed-in Keeper to the sign-in page. */
export async function requireKeeperPage(): Promise<string> {
  const email = await signedInKeeper();
  if (!email) redirect("/signin");
  return email;
}

/** For API routes: throws a 401 ApiError unless the Keeper is signed in. */
export async function requireKeeperApi(): Promise<string> {
  const email = await signedInKeeper();
  if (!email) throw new ApiError(401, "Sign in as the Keeper first.");
  return email;
}

export function jsonError(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
}
