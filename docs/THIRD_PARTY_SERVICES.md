# Сторонние сервисы и атрибуции Parkly

## Яндекс Карты

Используются карта и геокодирование. На карте должна сохраняться штатная атрибуция Яндекса. Перед релизом проверить тариф, разрешённые домены и Android-ограничения ключа.

## OpenStreetMap

Данные и маршруты могут содержать сведения OpenStreetMap. Атрибуция: `© OpenStreetMap contributors`, лицензия ODbL. Публичная ссылка: https://www.openstreetmap.org/copyright

## OpenRouteService

Используется сервером Parkly Route Beta. API key хранится только в Edge secret. В интерфейсе маршрута сохраняется атрибуция openrouteservice и OpenStreetMap.

## Supabase

Используется для Auth, PostgreSQL/PostGIS, Storage и Edge Functions. `service_role`, database password и JWT secrets не размещаются в клиентских файлах.

Перед публичным релизом ответственный должен проверить актуальные условия каждого поставщика; этот файл не заменяет юридическую проверку.
