# Musonic Server, built from source:
#   docker build -t musonic-server apps/server
# See compose.example.yml to run it.
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY . .
RUN cargo build --release --locked

FROM alpine:3.22
# ffmpeg: transcoding (lower bit rates on mobile data).
RUN apk add --no-cache ffmpeg && adduser -D -u 1000 musonic
COPY --from=build /src/target/release/musonic-server /usr/local/bin/musonic-server
USER musonic
ENV MUSONIC_BIND=0.0.0.0:4533 \
    MUSONIC_DATA_DIR=/data \
    MUSONIC_MUSIC_DIR=/music
EXPOSE 4533
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4533/health >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/musonic-server"]
