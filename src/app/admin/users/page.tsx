import { requireOwner, getSessionUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/users-admin";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function AdminUsersPage() {
  // Owner-only. `requireOwner` redirects an admin to /admin rather than showing a page they
  // cannot use — the nav does not link here for them either.
  await requireOwner();
  const me = await getSessionUser();
  const people = await listUsers();

  const counts = people.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Two roles, nothing in between. You are the <strong>owner</strong> — you decide who gets in.
          Everyone else is an <strong>admin</strong>: full run of the shop, but no access to this
          page. Customers need no account at all.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {people.length} accounts · {counts.OWNER ?? 0} owner · {counts.ADMIN ?? 0} admin
        </p>
      </div>

      <CreateUserForm />

      <div>
        <h2 className="mb-2 text-sm font-semibold">Accounts</h2>
        <ul className="space-y-2">
          {people.map((person) => (
            <UserRow key={person.id} user={person} isSelf={person.id === me?.id} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          <strong>Revoke</strong> clears the password and blocks sign-in, but keeps the account so past
          sales still show who recorded them. <strong>Remove</strong> deletes the account outright —
          past sales keep their rows, but stop showing a name. Everything here is owner-only.
        </p>
      </div>
    </div>
  );
}
