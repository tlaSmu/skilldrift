# skilldrift

[![CI](https://github.com/tlaSmu/skilldrift/actions/workflows/ci.yml/badge.svg)](https://github.com/tlaSmu/skilldrift/actions/workflows/ci.yml)

Inventory locally installed AI-agent skills across Claude Code, OMP, Codex, and Antigravity.

`skillctl` finds discoverable user, project, plugin, and system skill copies from one local scan. It validates skill metadata, produces deterministic hashes, and exposes both terminal and JSON output without requiring access to an agent runtime. See [ROADMAP.md](ROADMAP.md) for the current support boundary and planned capabilities.

## What You Can Do Today

- Discover installed or otherwise discoverable skill copies across four built-in harnesses with no initial `.skillctl.toml` configuration.
- Inspect local skill metadata, resources, approximate token counts, symlinks, and validation diagnostics.
- Save an index locally and filter it by harness or scope.
- Send the same inventory to automation through `--json`.
- Add nonstandard or unsupported roots through `.skillctl.toml`.

## Quick Start

Run a local inventory without installing globally:

```sh
npx @smugltonti/skilldrift scan
```

Or install the CLI:

```sh
npm install --global @smugltonti/skilldrift
skillctl scan
```

Build from source for development:

```sh
git clone https://github.com/tlaSmu/skilldrift.git
cd skilldrift
npm ci
npm run build
node dist/cli.js scan
```

Example plain-text output; counts depend on the local installation:

```text
$ node dist/cli.js scan --plain

Scan complete
  Skills discovered: 108
  Harnesses scanned: 4
  Skill roots: 72 directories
  Diagnostics: 3 issues | 0 warnings

Preview only. Rerun with --write to save the index.
```

Persist an inventory, then inspect one harness:

```sh
node dist/cli.js scan --write
node dist/cli.js ls --harness codex --scope plugin
```

```text
sample-skill  codex  plugin  ok
  ~/.codex/plugins/cache/example-market/example-plugin/1.0.0/skills/sample-skill/SKILL.md
```

For scripts and CI, use machine-readable output:

```sh
node dist/cli.js scan --json
```

## Current Support Boundary

`skillctl scan` is a **raw local inventory**. It records each copy that a built-in provider path makes discoverable, including the same physical skill file when more than one harness can see it.

It does not yet determine which copy a runtime will execute, label active versus shadowed skills, select one active plugin-cache version, or provide project/workspace parity for OMP, Codex, and Antigravity. Those capabilities are planned explicitly in [ROADMAP.md](ROADMAP.md); they are not implied by the current inventory.

Built-in harness IDs are reserved: `claude-code`, `omp`, `codex`, and `antigravity`.

## Built-in Harness Support

Default scans discover installed skills across four built-in adapters without initial configuration.

| Harness ID | Scope | Path / Source | Environment Override |
| --- | --- | --- | --- |
| `claude-code` | `user`, `project`, `plugin` | `~/.claude/skills`, ancestor and workspace `.claude/skills`, installed plugins | `CLAUDE_CONFIG_DIR` |
| `omp` | `user`, `plugin` | `~/.omp/agent/skills`, remapped Claude roots, `~/.agents/skills`, `~/.codex/skills`, managed skills | `PI_CODING_AGENT_DIR` |
| `codex` | `user`, `system`, `plugin` | `~/.agents/skills`, `~/.codex/skills`, `.system`, `/etc/codex/skills`, enabled plugin cache entries | `CODEX_HOME` |
| `antigravity` | `user`, `system` | `~/.gemini/config/skills`, `~/.gemini/antigravity/builtin/skills` | — |

Standard provider paths shared across tools, such as `~/.agents/skills`, can expose one physical skill under multiple harnesses. This is intentional inventory behavior. Effective-set resolution will later identify winners and shadowed copies.

## Commands

### Scan local inventory

```sh
skillctl scan
skillctl scan --plain
skillctl scan --json
skillctl scan --write
```

`--plain` forces portable text without ANSI color, box drawing, a spinner, or a banner. `--write` saves the index to `$XDG_DATA_HOME/skillctl/index.json` or `~/.local/share/skillctl/index.json`.

### List indexed skills

```sh
skillctl ls
skillctl ls --harness claude-code
skillctl ls --scope user,project
skillctl ls --harness generic-agent --scope project --json
skillctl ls --sort size
skillctl ls --sort mtime --long
```

The default listing includes skill name, harness, scope, symlink and resource indicators, approximate size, diagnostics, and path. `--long` adds a description row.

An indexed listing renders the discovered copies, their source harness, scope, resource count, size, diagnostics, and local path:

![Terminal listing from `skillctl ls --long`](docs/images/skillctl-ls.png)

### Configure nonstandard roots

Custom harness definitions are an escape hatch for unsupported or nonstandard skill directories. They must use an ID other than the four reserved built-in IDs.

```toml
[scan]
workspaces = ["~/projects"]
depth = 4
maxFiles = 50000
ignore = ["*.tmp"]

[[harness.custom]]
id = "custom-agent"
layout = "dir-skill-md"
roots = ["./skills:project:40"]
```

## Privacy and Compatibility

- `skilldrift` scans local filesystem roots only. It does not upload skill content or execute skill actions, shell scripts, or agent tasks.
- Node.js 20 or later is required.
- CI tests Node.js 20, 22, and 24 on macOS, Linux, and Windows.
- `/etc/codex/skills` discovery applies only on non-Windows platforms.

## Development

```sh
npm ci
npm run check
```

`npm run check` runs linting, strict type checking, tests, and the production build.

## Security and Feedback

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. For normal discovery, adapter, or output defects, use the [skill discovery report template](https://github.com/tlaSmu/skilldrift/issues/new?template=discovery-bug.yml).

## License

[MIT](LICENSE)
