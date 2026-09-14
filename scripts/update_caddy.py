#!/usr/bin/env python3
"""
Idempotently ensures /opt/proxy/Caddyfile imports /opt/pageos/caddy.conf.
Removes any inline pageos.org / app.pageos.org blocks first (brace-counted).
Run after every deploy; safe to run multiple times.
"""

CADDYFILE = "/opt/proxy/Caddyfile"
IMPORT_LINE = "import /etc/caddy/pageos.conf\n"  # resolves to /opt/proxy/pageos.conf on host
REMOVE_PREFIXES = ("pageos.org {", "www.pageos.org {", "app.pageos.org {")


def remove_pageos_blocks(lines):
    out = []
    depth = 0
    skipping = False
    for line in lines:
        s = line.strip()
        if not skipping:
            if any(s == p or s.startswith(p + "\n") for p in REMOVE_PREFIXES) or s in REMOVE_PREFIXES:
                skipping = True
                depth = s.count("{") - s.count("}")
                continue
            out.append(line)
        else:
            # Only count standalone braces, ignore {placeholder} patterns
            opens = sum(1 for c in s if c == "{")
            closes = sum(1 for c in s if c == "}")
            depth += opens - closes
            if depth <= 0:
                skipping = False
    return out


with open(CADDYFILE, "r") as f:
    lines = f.readlines()

lines = remove_pageos_blocks(lines)

# Strip trailing whitespace lines
while lines and lines[-1].strip() == "":
    lines.pop()

content = "".join(lines)

# Remove any stale pageos import lines (all variants, idempotent)
import re
content = re.sub(r"import\s+[^\n]*pageos[^\n]*\n?", "", content)
content = content.rstrip()

# Append the import directive
content += "\n\n" + IMPORT_LINE

with open(CADDYFILE, "w") as f:
    f.write(content)

print("Caddyfile updated — pageos.org served via import")
