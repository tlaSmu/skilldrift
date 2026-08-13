# Skilldrift Roadmap

This document outlines the operational support boundary and development roadmap for `skilldrift` and `skillctl`.

## Status Legend

- `[x]` Supported today
- `[ ]` Planned / In progress

---

## 1. Supported Today

The current version of `skilldrift` provides out-of-the-box local discovery and raw inventory indexing for built-in harnesses without requiring custom configuration. The four reserved built-in harness IDs are `claude-code`, `omp`, `codex`, and `antigravity`.

### Built-in Harness Matrix

| Harness ID | Scope | Default Path | Precedence | Read-only | Environment Overrides |
| --- | --- | --- | --- | --- | --- |
| `claude-code` | `user` | `~/.claude/skills` | 20 | No | `CLAUDE_CONFIG_DIR` |
| `claude-code` | `project` | Ancestor `.claude/skills` & Workspaces | 30 | No | — |
| `claude-code` | `plugin` | `installed_plugins.json` / legacy cache | 10 | Yes | `CLAUDE_CONFIG_DIR` |
| `omp` | `user` | `~/.omp/agent/skills` | 100 | No | `PI_CODING_AGENT_DIR` |
| `omp` | `user` / `plugin` | Remapped Claude global/plugin roots | 80 / 70 | No / Yes | `CLAUDE_CONFIG_DIR` |
| `omp` | `user` | `~/.agent/skills` | 70 | No | — |
| `omp` | `user` | `~/.agents/skills` | 70 | No | — |
| `omp` | `user` | `~/.codex/skills` | 70 | No | — |
| `omp` | `user` | `~/.omp/agent/managed-skills` | 5 | No | `PI_CODING_AGENT_DIR` |
| `codex` | `user` | `~/.agents/skills` | 20 | No | — |
| `codex` | `user` | `~/.codex/skills` | 20 | No | `CODEX_HOME` |
| `codex` | `system` | `~/.codex/skills/.system` | 10 | Yes | `CODEX_HOME` |
| `codex` | `system` | `/etc/codex/skills` (POSIX only) | 10 | Yes | — |
| `codex` | `plugin` | `plugins/cache/<market>/<plugin>/*/skills` | 15 | Yes | `CODEX_HOME` |
| `antigravity` | `user` | `~/.gemini/config/skills` | 20 | No | — |
| `antigravity` | `system` | `~/.gemini/antigravity/builtin/skills` | 10 | Yes | — |

- `[x]` Out-of-the-box discovery for `claude-code`, `omp`, `codex`, and `antigravity`.
- `[x]` Multi-harness physical copy discovery (e.g. shared `~/.agents/skills` surfacing under both `omp` and `codex`).
- `[x]` Custom harness definition escape hatch in `.skillctl.toml`.

---

## 2. Next: Truth

- `[ ]` **Effective-Set Resolution**: Precedence calculation to determine winning skill copies vs shadowed copies.
- `[ ]` **Active vs. Shadowed Status**: Explaining which skill version an agent runtime will execute.
- `[ ]` **Conflict Diagnostics**: Flagging exact duplicates and name collisions across harnesses.
- `[ ]` **Diagnostic Commands**: `skillctl explain <skill>` and `skillctl doctor` for deep inspection.

---

## 3. Adapter Parity

- `[ ]` **Project/Workspace Parity**: Project `.agents/skills` and workspace discovery for OMP, Codex, and Antigravity.
- `[ ]` **OMP Advanced Config**: OMP profiles, custom directories, extension packages, and source toggles.
- `[ ]` **Codex State Filtering**: Filtering disabled skills and selecting single active plugin versions.
- `[ ]` **Additional Adapters**: Native support for Cursor, Roo Code, Windsurf, and other emerging harnesses.

---

## 4. Later

- `[ ]` **Usage Signals**: Identifying dead skills and unused skill definitions.
- `[ ]` **Near-Duplicate Analysis**: Content similarity analysis across diverging skill copies.
- `[ ]` **Rich Reporting**: Interactive HTML reports and visual dependency/precedence graphs.
- `[ ]` **Remediation Actions**: Controlled quarantine, restore, and deduplication workflows.

---

## Explicit v1 Exclusions

The following capabilities are explicitly out of scope for v1:

1. **No Marketplace / Publishing**: `skilldrift` is a local inventory tool, not a skill registry or marketplace.
2. **No Content Editing / Generation**: `skilldrift` does not author, refactor, or rewrite skill markdown files.
3. **No Dynamic Injection**: `skilldrift` does not inject skills into active AI agent context windows.
4. **No Git Automation**: `skilldrift` does not issue automated git commits, branches, or remote pushes.
5. **No Runtime Execution**: `skilldrift` does not execute skill actions, shell scripts, or agent tasks.
