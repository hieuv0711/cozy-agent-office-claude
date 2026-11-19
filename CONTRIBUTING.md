# Contributing to Agent Office

Thanks for helping. Issues are welcome for bugs, rough edges and ideas; for a bigger change, open an
issue first so we can agree on the shape of it.

## Build it from source

You need Node.js 20 or newer and, for the tests, Google Chrome.

```sh
git clone https://github.com/hieuv0711/cozy-agent-office-claude.git
cd cozy-agent-office-claude
npm install
npm run build        # the web app, into dist/
npm start -- --open  # serves http://127.0.0.1:4777 and opens it
```

For live reload, run `npm run dev:server` and `npm run dev:web` together and open
http://localhost:5173. `?demo` fills the room with made-up sessions, so screenshots never show your
own projects.

- `server/` is plain Node with no dependencies. It reads Claude Code's files read-only and writes
  only inside `~/.agent-office/`.
- `web/` is React, three.js and react-three-fiber. The rooms and the people are generated in code
  (`web/src/tide/`).
- `vscode/` is the VS Code / Cursor extension: a panel that shows the same page, served by its own
  copy of the server.
- `docs/DESIGN.md` describes the screens and how every number is worked out; read it before
  changing what something means.

## The rooms' saved pieces

The browser saves the generated rooms once per build of the code that drew them, so later opens
take about a second. Their key is a fingerprint of the scene modules (`assetFingerprint()` in
`web/vite.config.ts`: the modules that build assets and what they import inside `tide/`, `tank/`,
`lib/` and `theme.ts`). Keep words shown in the interface out of those modules: a change there
rebuilds everyone's rooms once. `npm run build` prints the fingerprint.

## Tests

```sh
npm run typecheck
npm run test:e2e                              # every scenario in docs/test-scenarios.md
npx playwright test tests/e2e/history.spec.ts # one area
```

The end-to-end tests run against the built app on http://127.0.0.1:4777 (`npm start`), in the
installed Google Chrome with its GPU (`--use-angle=metal` on macOS; the software renderer can't draw
the scene). Each test is named after its scenario ID in `docs/test-scenarios.md`; add or change the
scenario with the test.

## Pull requests

`master` only changes through pull requests. Nobody pushes to it directly, maintainers included.

Work on a branch and open a pull request against `master`. It can merge once its CI check,
**Build and check** (`.github/workflows/ci.yml`), passes. That check runs:
- the typecheck;
- the token and cost checks (`npm run selftest`);
- the web build;
- the extension package.

Its `.vsix` is attached to the run, so you can try the change in VS Code before merging. The
end-to-end tests need a GPU, so CI can't run them. For anything that changes what's on screen, run
them on your own computer and say so in the pull request.

## Releasing (maintainers)

A release publishes one version everywhere: npm (`cozy-agent-office-claude`), the VS Code Marketplace
and Open VSX (publisher `hieuv0711`). It also makes a GitHub release with the `.vsix`.
`.github/workflows/release.yml` does all of it when a version tag is pushed:

1. On a branch, run `npm run bump -- 0.2.0`. It sets the version in `package.json`,
   `package-lock.json` and `vscode/package.json`, and starts a `## 0.2.0` section in
   `CHANGELOG.md`. Write what changed there; it becomes the release's text. Open a pull request
   and merge it.
2. Tag the merge on `master` and push the tag:

   ```sh
   git switch master && git pull
   git tag -a v0.2.0 -m "Agent Office 0.2.0"
   git push origin v0.2.0
   ```

The workflow does three things, in order:
1. **Checks the tag.** It must be on `master` and match all three version fields and a
   `CHANGELOG.md` section.
2. **Rebuilds and rechecks everything,** as CI does.
3. **Publishes.** Each publishing step skips a version that is already out, so a failed run can
   simply be re-run.

Two rules about version numbers:
- Use `major.minor.patch` only. The Marketplace takes no pre-release tags.
- A version can't be published twice. Fix a bad release with a new patch version.

No publishing token lives on anyone's computer or in the repository. All three registries trust
the workflow itself (trusted publishing over OIDC), and npm adds provenance. Each one is set up on
its own site:
- **npm:** the package's Settings → Trusted Publisher on npmjs.com.
- **Marketplace:** the Trusted Publishing tab of the `hieuv0711` publisher at
  https://marketplace.visualstudio.com/manage. A new policy has to be used within 48 hours, or it
  lapses and has to be made again.
- **Open VSX:** https://open-vsx.org/user-settings/trusted-publishers.

All three point at this repository, `release.yml` and the `release` environment (Settings →
Environments), which only runs for `v*` tags.

A fork that publishes its own copy changes four things: the package name and publisher in both
`package.json` files, `README.md`, the workflow, and this file. It also sets up its own trusted
publishers.

If the workflow can't run, publish by hand from a clean checkout of the tag:
1. Build: `npm ci && npm run build && npm run build:vscode`.
2. npm: `npm publish`, which needs 2FA on the npm account.
3. Marketplace: upload the `.vsix` at https://marketplace.visualstudio.com/manage (the extension's
   ··· menu → Update).
4. Open VSX: `npx ovsx@0 publish cozy-agent-office-claude-<version>.vsix -p <token>`.
