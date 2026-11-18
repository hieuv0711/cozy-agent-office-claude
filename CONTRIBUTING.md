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

## Publishing (maintainers)

The npm package is `cozy-agent-office-claude`, and the extension's publisher is `hieuv0711` on both the
VS Code Marketplace and Open VSX. A fork that publishes its own copy changes the publisher in
`vscode/package.json`, `README.md` and this file.

```sh
# npm: `npx cozy-agent-office-claude`
npm login
npm publish                  # builds the web app first (prepublishOnly)

# the extension: VS Code Marketplace and Open VSX
npm run build:vscode         # makes cozy-agent-office-claude-<version>.vsix
npx @vscode/vsce@3 login hieuv0711
npx @vscode/vsce@3 publish --packagePath cozy-agent-office-claude-<version>.vsix
npx ovsx@0 publish cozy-agent-office-claude-<version>.vsix -p <your Open VSX token>
```

`npm publish` needs two-factor authentication on the npm account. The other way is
`npm stage publish`, then approving the staged version under Staged Packages on npmjs.com, which also
asks for 2FA.

The Marketplace publisher is managed at https://marketplace.visualstudio.com/manage. `vsce` signs in
with an Azure DevOps personal access token with the Marketplace "Manage" scope. Azure DevOps retires
global tokens on December 1, 2026. Uploading the .vsix on that page needs no token: New extension for
the first version, then Update in the extension's menu.

Open VSX needs an account, the namespace (made once with
`npx ovsx@0 create-namespace hieuv0711 -p <token>`) and a token from
https://open-vsx.org/user-settings/tokens. Bump the version in both `package.json` files together.
