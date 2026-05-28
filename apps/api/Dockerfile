FROM golang:1.22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download 2>/dev/null || true
COPY apps/api/ ./
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o /pulsewatch-api ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates iputils
WORKDIR /app
COPY --from=builder /pulsewatch-api .
EXPOSE 4000
CMD ["./pulsewatch-api"]
