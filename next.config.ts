import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	serverExternalPackages: ["better-sqlite3", "bcryptjs"],
	// Docker Engine calls /v2/ — default 308 to /v2 drops the Authorization header on redirect
	skipTrailingSlashRedirect: true,
	// Local dev without front-proxy: raise limit so /v2 route handler can stream layers.
	experimental: {
		proxyClientMaxBodySize: "10gb",
	},

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					// Prevent clickjacking
					{ key: "X-Frame-Options", value: "DENY" },
					// Prevent MIME sniffing
					{ key: "X-Content-Type-Options", value: "nosniff" },
					// Referrer policy — don't leak URL to external sites
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					// Permissions policy — disable unnecessary browser features
					{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
					// XSS protection header (legacy browsers)
					{ key: "X-XSS-Protection", value: "1; mode=block" },
					// Content Security Policy
					{
						key: "Content-Security-Policy",
						value: [
							"default-src 'self'",
							process.env.NODE_ENV === "development"
								? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
								: "script-src 'self' 'unsafe-inline'",
							"style-src 'self' 'unsafe-inline'",
							"img-src 'self' data: blob:",
							"font-src 'self'",
							"connect-src 'self'",
							"frame-ancestors 'none'",
						].join("; "),
					},
				],
			},
		];
	},
};

export default nextConfig;
