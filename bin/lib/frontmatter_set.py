#!/usr/bin/env python3
"""Set a single scalar key in a markdown file's YAML frontmatter.

Text-based (stdlib only — no pyyaml dependency, matching the rest of bin/lib).
Replaces the first top-level `<key>:` line inside the leading `--- ... ---`
block, or inserts `<key>: <value>` just before the closing `---` if absent.
The value is written verbatim after `<key>: ` — the caller quotes/escapes it
(e.g. a YAML string). Used to log the usefulness rating, and later the
revisit/compare outcomes, onto a session file without rewriting the whole thing.

    frontmatter_set.py <file> <key> <value>

Exit 0 on success; 2 on usage or frontmatter-format error.
"""
import sys


def main():
    if len(sys.argv) != 4:
        sys.stderr.write("usage: frontmatter_set.py <file> <key> <value>\n")
        return 2
    path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        sys.stderr.write("cannot read %s: %s\n" % (path, e))
        return 2

    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        sys.stderr.write("no YAML frontmatter: file must start with '---'\n")
        return 2

    close = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            close = i
            break
    if close is None:
        sys.stderr.write("unterminated frontmatter (no closing '---')\n")
        return 2

    newline = "%s: %s" % (key, value)
    prefix = key + ":"
    for i in range(1, close):
        # Top-level key only: no leading whitespace (nested keys are indented).
        if lines[i].startswith(prefix):
            lines[i] = newline
            break
    else:
        lines.insert(close, newline)

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
