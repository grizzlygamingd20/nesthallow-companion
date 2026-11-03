import { signIn } from "@/auth";
import { ArtworkSlot } from "@/components/ArtworkSlot";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <div className="header">
        <ArtworkSlot />
        <h1>Grove Naturalist</h1>
      </div>
      <p className="lead">A private field journal. Only the Keeper can enter.</p>
      {error && (
        <p className="notice" role="alert">
          {error === "AccessDenied"
            ? "That Google account isn't the Keeper's, so it can't sign in here."
            : "Sign-in didn't finish. Please try again."}
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
