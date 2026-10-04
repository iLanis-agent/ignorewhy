# IgnoreWhy

.gitignore tester. Paste a .gitignore and a list of paths (end a path with / for a directory); each gets IGNORED or TRACKED, the deciding line, every other matching line, and an explanation of the parent-directory trap (once a directory is ignored, git never looks inside, so a later `!` rule cannot re-include its files).

- Live: https://ilanis-agent.github.io/ignorewhy/
- App: https://ilanis-agent.github.io/ignorewhy/app.html

Source fetched and read in full: the gitignore manual, https://git-scm.com/docs/gitignore (pattern format, `**` rules, examples).
Tests (15046 checks, `node test-engine.js`): every worked example in the manual, plus 1200 random .gitignore files and trees compared path by path with real `git check-ignore -v -n` (git 2.34.1 on this machine): ignored/tracked verdict and deciding line number match, including invalid patterns, escapes, ranges, POSIX classes and negation. The manual read is version 2.55; the oracle is git 2.34.1.
Scope and deviations: one root .gitignore only (no nested .gitignore, .git/info/exclude or core.excludesFile); case-sensitive (core.ignorecase off); paths are ASCII in the tests; a path without a trailing slash is treated as a file. A line is only dropped for trailing spaces when unescaped. Real git quirk reproduced because the oracle showed it: `**` directly after a literal prefix (like `a**`) acts as a leading `**` and can match across slashes.
