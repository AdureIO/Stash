"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
	label?: string;
	value: string;
}

export function CopySnippet({ label, value }: Props) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div>
			{label && <p className="text-xs font-medium portal-code-label mb-1.5">{label}</p>}
			<div className="relative group">
				<pre className="portal-code-block">{value}</pre>
				<button type="button" onClick={copy} className="portal-code-copy" title="Copy">
					{copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
				</button>
			</div>
		</div>
	);
}
