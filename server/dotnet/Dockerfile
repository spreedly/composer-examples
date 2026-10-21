# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer .NET SDK (Spreedly.ComposerSdk.Server) is not yet published to
# NuGet. We bring its source in through the BuildKit named context "sdk" (wired up in
# ../docker-compose.yml) and reference it via ProjectReference in Sidecar.csproj.
#
# Once the SDK is published, delete the SDK COPY below and depend on the NuGet package.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY --from=sdk . /composer-sdk-server-dotnet
COPY . .
RUN dotnet publish -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV PORT=3026
ENV HOST=0.0.0.0
EXPOSE 3026
USER $APP_UID
ENTRYPOINT ["dotnet", "Sidecar.dll"]
