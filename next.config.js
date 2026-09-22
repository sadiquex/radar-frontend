/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        // The live trip view moved from /t/[code] to /app/t/[code], but
        // group URLs were shared and bookmarked at /t/CODE before that move,
        // and backend/src/push/sender.ts still builds push-notification
        // payloads pointing at the old path — so tapping a notification
        // needs somewhere real to land. `/t/:code` matches exactly one path
        // segment, so it does NOT catch /t/:code/join (app/t/[code]/join),
        // which is a real route and must keep resolving unredirected.
        source: "/t/:code",
        destination: "/app/t/:code",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
