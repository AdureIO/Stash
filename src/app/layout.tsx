import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Stash",
	description: "Self-hosted Docker, Maven & NPM registry admin panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
