#!/usr/bin/env python3
"""
Idempotently upserts the pageos.org block inline in /opt/proxy/Caddyfile.
Uses brace-counting to correctly handle nested blocks.
Run after every deploy; safe to run multiple times.
"""
import re

CADDYFILE = "/opt/proxy/Caddyfile"
REMOVE_PREFIXES = ("pageos.org {", "www.pageos.org {", "app.pageos.org {")

NEW_BLOCK = """\
www.pageos.org {
\tredir https://pageos.org{uri} permanent
}

pageos.org {
\thandle /api/* {
\t\treverse_proxy pageos-api-1:8080
\t}
\thandle {
\t\treverse_proxy pageos-web-1:3000
\t}
}

app.pageos.org {
\thandle /api/* {
\t\treverse_proxy pageos-api-1:8080
\t}
\thandle {
\t\treverse_proxy pageos-web-1:3000
\t}
}
"""


def remove_pageos_blocks(lines):
    out = []
    depth = 0
    skipping = False
    for line in lines:
        s = line.strip()
        if not skipping:
            if s in REMOVE_PREFIXES:
                skipping = True
                depth = 1
                continue
            out.append(line)
        else:
            depth += s.count("{") - s.count("}")
            if depth <= 0:
                skipping = False
    return out


with open(CADDYFILE, "r") as f:
    lines = f.readlines()

lines = remove_pageos_blocks(lines)

# Remove stale import lines
content = "".join(lines)
content = re.sub(r"import[^\n]*pageos[^\n]*\n?", "", content)
content = content.rstrip()

# Append inline block
content += "\n\n" + NEW_BLOCK

with open(CADDYFILE, "w") as f:
    f.write(content)

print("Caddyfile updated")
