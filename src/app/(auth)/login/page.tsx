import { LoginForm } from "./login-form";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
	const session = await getSession();
	if (session) {
		if (session.totpVerified === false) redirect("/login/totp");
		redirect("/dashboard");
	}

	const ssoProviders = db.sso.findActive().map((p) => ({ id: p.id, name: p.name, type: p.type }));
	return <LoginForm ssoProviders={ssoProviders} />;
}
