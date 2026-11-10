# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
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
