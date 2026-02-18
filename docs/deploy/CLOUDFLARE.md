# Cloudflare (DNS/SSL)

Плейсхолдеры:
- `PRODUCTION_DOMAIN`
- `SERVER_IP`

## DNS

В Cloudflare → DNS:
- A record: `PRODUCTION_DOMAIN` -> `SERVER_IP`
- Proxy status: по ситуации (часто удобно включить)

## SSL/TLS

В Cloudflare → SSL/TLS:
- режим: `Full (Strict)` (рекомендуется)

Два рабочих варианта:
- Let's Encrypt на сервере (сертификаты управляет certbot)
- Cloudflare Origin Certificate (сертификат от Cloudflare для origin)

## Типовые ошибки

- `ERR_SSL_PROTOCOL_ERROR`: обычно неверный режим SSL/TLS или сервер не отдаёт корректный сертификат.
- Mixed Content в Telegram Mini App: домен/URL должны быть `https://`.
