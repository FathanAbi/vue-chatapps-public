# Shared proxy headers for the Payload backend. Included by the /api/ locations
# in default.conf so that the backend sees the real client address (used by the
# rate-limiting and audit logic) and the original host/scheme.

proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 90s;
