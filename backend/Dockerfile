FROM golang:1.26-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server ./cmd/server
FROM alpine:3.22
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=build /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
