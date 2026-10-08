# The Knightly server: the FastAPI app with the built web app and Stockfish. Builds for the
# machine it's built on (arm64 on an Apple-silicon Mac or the Oracle VM, amd64 on CI).
#   docker compose up --build      (see docker-compose.yml)

FROM node:22-slim AS web
RUN npm install --global pnpm@12
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.11-slim-trixie
# Debian's Stockfish lands in /usr/games; zstd unpacks the Lichess puzzle database;
# postgresql-client brings pg_dump for the daily backup.
RUN apt-get update && apt-get install --yes --no-install-recommends stockfish zstd postgresql-client \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
# Dependencies first, so a code change doesn't reinstall them.
COPY pyproject.toml uv.lock README.md LICENSE ./
RUN uv sync --locked --no-dev --no-install-project
COPY src/ src/
RUN uv sync --locked --no-dev
COPY --from=web /web/dist web/dist

RUN useradd --create-home --uid 1000 knightly && mkdir /data && chown knightly /data
USER knightly
# KNIGHTLY_DATABASE_URL comes from the environment it runs in (docker-compose.yml).
ENV PATH="/app/.venv/bin:/usr/games:$PATH" KNIGHTLY_MODE=server KNIGHTLY_DATA_DIR=/data
EXPOSE 8000
CMD ["knightly", "serve", "--host", "0.0.0.0", "--port", "8000"]
