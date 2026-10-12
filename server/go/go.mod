module composer-examples/go-sidecar

go 1.26.3

require (
	github.com/joho/godotenv v1.5.1
	github.com/spreedly/composer-sdk-server-go v0.0.0
)

replace github.com/spreedly/composer-sdk-server-go => ../../../composer-sdk-server-go
