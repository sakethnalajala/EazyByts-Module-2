/**
 * Builds the workspaces the API needs, at install time.
 *
 * Why at install time: Render's service is configured through its dashboard,
 * which ignores `render.yaml`'s buildCommand. `npm install` is the one hook
 * that always runs, so this is what guarantees `server/dist/index.js` exists
 * before the start command looks for it.
 *
 * Why it must be skippable: Vercel builds only the client, from the same
 * repository. It has no need for the server build, and running `tsc` during
 * its install step fails with "tsc: command not found" - killing a deploy
 * that never wanted the server in the first place. The client builds the
 * shared package itself, in its own `prebuild`.
 */
import { execSync } from 'node:child_process';

const skipReasons = [
  // Vercel sets this on every build. The client deploy does not need the
  // server, and its own prebuild handles the shared package.
  [process.env.VERCEL, 'VERCEL is set - the client deploy builds what it needs itself'],
  [process.env.SKIP_WORKSPACE_BUILD, 'SKIP_WORKSPACE_BUILD is set'],
];

for (const [flag, reason] of skipReasons) {
  if (flag) {
    console.log(`postinstall: skipped (${reason})`);
    process.exit(0);
  }
}

try {
  execSync('npm run build:shared && npm run build:server', {
    stdio: 'inherit',
    env: process.env,
  });
  console.log('postinstall: shared + server built');
} catch {
  /*
   * Deliberately non-fatal.
   *
   * A missing compiler must not break `npm install` for someone who only
   * wants to run the client, or the tests, or nothing at all. The deploy that
   * genuinely needs the output verifies it separately: render.yaml ends its
   * build with `test -f server/dist/index.js`, which fails loudly.
   */
  console.warn(
    'postinstall: workspace build skipped (build tooling unavailable). ' +
      'This is only a problem for the API deploy, which verifies the artifact itself.',
  );
}
