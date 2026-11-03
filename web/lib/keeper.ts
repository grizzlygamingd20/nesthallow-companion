// Who may use the Grove Naturalist: exactly one person, the Keeper.
// Kept free of framework imports so it can be unit-tested directly.

export function keeperEmail(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.KEEPER_EMAIL || "").trim().toLowerCase();
  return v.includes("@") ? v : null;
}

/** True only for the configured Keeper address, and only when Google has verified it. */
export function isKeeper(
  email: string | null | undefined,
  verified: boolean | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const keeper = keeperEmail(env);
  if (!keeper || !email || verified !== true) return false;
  return email.trim().toLowerCase() === keeper;
}
