#!/usr/bin/env python3
"""
Updates /opt/proxy/Caddyfile to proxy app.pageos.org to dev containers
(pageos-dev-api-1 and pageos-dev-web-1 via proxy_net).
Idempotent — safe to run on every dev deploy.
"""
import re

CADDYFILE = "/opt/proxy/Caddyfile"
REMOVE_PREFIXES = ("app.pageos.org {",)

NEW_BLOCK = """\
app.pageos.org {
\thandle /api/* {
\t\treverse_proxy pageos-dev-api-1:8080
\t}
\thandle {
\t\treverse_proxy pageos-dev-web-1:3000
\t}
}
"""


def remove_app_pageos_block(lines):
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

lines = remove_app_pageos_block(lines)

content = "".join(lines).rstrip()
content += "\n\n" + NEW_BLOCK

with open(CADDYFILE, "w") as f:
    f.write(content)

print("Caddyfile updated — app.pageos.org proxies to dev containers")
