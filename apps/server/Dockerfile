# Musonic Server with its administration console, built from source:
#   docker build -t musonic-server -f apps/server/Dockerfile .
# (from the repository root: the console is built from apps/admin and packages/).
# See apps/server/compose.example.yml to run it.
FROM node:24-alpine AS console
WORKDIR /src
COPY package.json package-lock.json .nvmrc ./
COPY apps/admin apps/admin
COPY packages packages
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/admin --include-workspace-root && npm run build --workspace apps/admin

FROM rust:1-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY apps/server .
RUN cargo build --release --locked

FROM alpine:3.22
# ffmpeg: transcoding (lower bit rates on mobile data).
RUN apk add --no-cache ffmpeg && adduser -D -u 1000 musonic
COPY --from=server /src/target/release/musonic-server /usr/local/bin/musonic-server
COPY --from=console /src/apps/admin/dist /usr/share/musonic/admin
USER musonic
ENV MUSONIC_BIND=0.0.0.0:4533 \
    MUSONIC_DATA_DIR=/data \
    MUSONIC_MUSIC_DIR=/music
EXPOSE 4533
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4533/health >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/musonic-server"]
