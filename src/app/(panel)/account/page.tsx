import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { UserTotpSection } from "@/components/account/user-totp-section";
import { UserPasswordSection } from "@/components/account/user-password-section";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
	const session = await getSession();
	if (!session) redirect("/login");

	const user = db.users.findById(session.userId);
	if (!user) redirect("/login");

	const totpEnabled = !!(user.totp_enabled && user.totp_secret);

	return (
		<div>
			<Header
				title="My account"
				subtitle="Security settings for your user"
				actions={
					<Badge variant={totpEnabled ? "success" : "default"}>
						{totpEnabled ? "2FA on" : "2FA off"}
					</Badge>
				}
			/>
			<div className="space-y-4 max-w-2xl">
				<UserTotpSection username={user.username} initialEnabled={totpEnabled} />
				<UserPasswordSection />
			</div>
		</div>
	);
}
