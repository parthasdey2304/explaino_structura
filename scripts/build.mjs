// Bun is the local Windows runtime. Netlify's current Next.js runtime requires
// Node during page-data collection, so keep that hosted build on Node only.
const command = process.env.NETLIFY === "true"
  ? ["node", "node_modules/next/dist/bin/next", "build", "--webpack"]
  : ["bun", "run", "--bun", "next", "build", "--webpack"];

const child = Bun.spawn(command, {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exitCode = await child.exited;
