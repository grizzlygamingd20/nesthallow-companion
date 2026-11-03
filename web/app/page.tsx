import { signOut } from "@/auth";
import { ArtworkSlot } from "@/components/ArtworkSlot";
import { db } from "@/lib/db";
import { requireKeeperPage } from "@/lib/session";

export const dynamic = "force-dynamic";

async function connectionStatus() {
  let database = false;
  let migrations: string[] = [];
  try {
    const rows = await db()`select name from schema_migrations order by name`;
    database = true;
    migrations = rows.map((r) => r.name as string);
  } catch {
    database = false;
  }
  return { database, migrations, photos: Boolean(process.env.BLOB_READ_WRITE_TOKEN) };
}

export default async function Home() {
  const email = await requireKeeperPage();
  const s = await connectionStatus();
  return (
    <main>
      <div className="header">
        <ArtworkSlot />
        <div>
          <h1>Grove Naturalist</h1>
          <p className="lead">Signed in as {email}</p>
        </div>
      </div>

      <section className="card" aria-labelledby="status-h">
        <h2 id="status-h">Foundation check</h2>
        <ul className="status">
          <li>
            Field archive (database):{" "}
            {s.database ? <span className="ok">connected</span> : <span className="bad">not connected</span>}
            {s.database && s.migrations.length > 0 && <> · schema {s.migrations.at(-1)}</>}
          </li>
          <li>
            Private photo storage:{" "}
            {s.photos ? <span className="ok">connected</span> : <span className="bad">not connected</span>}
          </li>
          <li>
            Sign-in: <span className="ok">Keeper only</span>
          </li>
        </ul>
      </section>

      <p>The expedition journal arrives in the next milestone.</p>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button className="quiet" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
