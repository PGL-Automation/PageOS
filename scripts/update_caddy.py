#!/usr/bin/env python3
"""Idempotently upserts the pageos.org block in /opt/proxy/Caddyfile."""
import re

CADDYFILE = "/opt/proxy/Caddyfile"

NEW_BLOCK = """
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
"""

with open(CADDYFILE, "r") as f:
    content = f.read()

# Remove old blocks (idempotent)
content = re.sub(r"app\.pageos\.org \{[^}]*\}\n?", "", content)
content = re.sub(r"(www\.)?pageos\.org \{[^}]*\}\n?", "", content)
content = content.rstrip() + "\n" + NEW_BLOCK

with open(CADDYFILE, "w") as f:
    f.write(content)

print("Caddyfile updated")
