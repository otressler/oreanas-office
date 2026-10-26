# Production image: the ASP.NET Core server, serving the built frontend from wwwroot.
#   docker build -t oreanas-office:local .
#   docker compose --profile app up --build   (with SQL Server and Azurite)

# --- Frontend -----------------------------------------------------------------
FROM node:24-slim AS web
WORKDIR /src/web
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/web/ ./
# The Impressum's details (src/web/vite.config.ts), kept out of the repository.
# CI passes them from repository variables, docker compose from .env.
ARG IMPRINT_NAME
ARG IMPRINT_STREET
ARG IMPRINT_CITY
ARG IMPRINT_EMAIL
RUN npm run build

# --- Backend ------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
# Project files first, so the restore layer is cached until dependencies change.
COPY Directory.Build.props ./
COPY src/Server/OreanasOffice.Server.csproj src/Server/
RUN dotnet restore src/Server/OreanasOffice.Server.csproj
COPY src/Server/ src/Server/
# OpenApiGenerateDocuments=false: otherwise the build starts the app to write
# src/web/src/api/openapi.json, which the image doesn't need.
RUN dotnet publish src/Server/OreanasOffice.Server.csproj \
    --configuration Release \
    --no-restore \
    --output /app \
    -p:OpenApiGenerateDocuments=false \
    -p:UseAppHost=false

# --- Runtime ------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=server /app ./
COPY --from=web /src/web/dist ./wwwroot/
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "OreanasOffice.Server.dll"]
