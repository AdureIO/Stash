import { Card } from "@/components/ui/card";
import type { AccessRuleSource } from "@/lib/access-control";
import type { DefaultAccess } from "@/lib/db";

interface Props {
	defaultAccess: DefaultAccess;
	rules: AccessRuleSource[];
}

export function UserInheritedAccess({ defaultAccess, rules }: Props) {
	return (
		<Card>
			<div className="px-6 py-5 space-y-3">
				<h2 className="text-sm font-semibold text-zinc-900">Effective repository access</h2>
				<p className="text-xs text-zinc-500">
					{defaultAccess === "allow" ? (
						<>
							Default policy is <strong>all repositories</strong> (limited by role). Group and user rules
							can add actions on matching patterns.
						</>
					) : (
						<>
							Default policy is <strong>no repository access</strong>. Access is granted only by the rules
							below (from groups or direct user rules), capped by role.
						</>
					)}
				</p>
				{rules.length === 0 ? (
					<p className="text-sm text-zinc-400">
						{defaultAccess === "allow"
							? "No group rules — role alone defines access to all repositories."
							: "No inherited rules — user cannot pull or push any repository until assigned to a group with rules."}
					</p>
				) : (
					<div className="rounded-lg border border-zinc-100 overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="bg-zinc-50 text-left text-xs text-zinc-500">
									<th className="px-3 py-2 font-medium">Pattern</th>
									<th className="px-3 py-2 font-medium">Actions</th>
									<th className="px-3 py-2 font-medium">Source</th>
								</tr>
							</thead>
							<tbody>
								{rules.map((rule, i) => (
									<tr key={i} className="border-t border-zinc-100">
										<td className="px-3 py-2 font-mono text-xs text-zinc-800">{rule.repository}</td>
										<td className="px-3 py-2 text-zinc-600">{rule.actions}</td>
										<td className="px-3 py-2 text-zinc-500">
											{rule.source === "group" ? `Group: ${rule.groupName}` : "User rule"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<p className="text-xs text-zinc-400">
					Docker: <code className="text-zinc-600">org/team/*</code> · Maven:{" "}
					<code className="text-zinc-600">com/example/*</code> or{" "}
					<code className="text-zinc-600">maven:com.example:*</code> · NPM:{" "}
					<code className="text-zinc-600">@scope/pkg</code> or <code className="text-zinc-600">npm:name</code>
				</p>
			</div>
		</Card>
	);
}
