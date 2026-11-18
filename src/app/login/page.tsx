import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Do not show a login form to someone holding a valid session.
  if (await getSessionUser()) redirect("/admin");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 mb-8 text-sm text-neutral-600">
        For partners and admins managing stock. Customers can browse without an account.
      </p>

      <LoginForm />

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        Passwords are set by whoever runs the shop, not self-registered. Ask them for access, or run{" "}
        <code className="rounded bg-black/5 px-1 py-0.5">npm run user:password</code> on the server.
      </p>
    </div>
  );
}
