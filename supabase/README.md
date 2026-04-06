# TwinFrequency — Supabase Backend

## Структура файлов

```
supabase/
├── migrations/
│   ├── 20260405000000_init_schema.sql   ← Таблицы, триггеры, начальные данные
│   └── 20260405000001_rls_policies.sql  ← Row Level Security политики
└── functions/
    ├── get-feed/index.ts                ← Алгоритм ленты (GET /get-feed)
    └── record-swipe/index.ts            ← Запись свайпа (POST /record-swipe)
```

---

## Деплой — пошаговая инструкция

### 1. SQL-миграции (Supabase Dashboard)

1. Открыть **Supabase Dashboard → SQL Editor**
2. Выполнить `20260405000000_init_schema.sql` — создаёт все таблицы
3. Выполнить `20260405000001_rls_policies.sql` — включает RLS

### 2. Storage Bucket

1. **Dashboard → Storage → New Bucket**
2. Имя: `avatars`, тип: **Public**
3. Добавить политики:

| Операция | Политика |
|----------|----------|
| SELECT | `true` (публичный) |
| INSERT | `(storage.foldername(name))[1] = auth.uid()::text` |
| UPDATE | `(storage.foldername(name))[1] = auth.uid()::text` |
| DELETE | `(storage.foldername(name))[1] = auth.uid()::text` |

### 3. Edge Functions

```bash
# Установить Supabase CLI
npm install -g supabase

# Войти
supabase login

# Линковать проект
supabase link --project-ref pewgupxikbswhaqxjrwk

# Деплоить функции
supabase functions deploy get-feed
supabase functions deploy record-swipe
```

### 4. Переменные окружения для Edge Functions

В **Dashboard → Settings → Edge Functions** добавить:
- `SUPABASE_URL` — уже есть автоматически
- `SUPABASE_ANON_KEY` — уже есть автоматически
- `SUPABASE_SERVICE_ROLE_KEY` — скопировать из Settings → API

---

## Схема базы данных

### `profiles`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | = auth.users.id |
| `name` | TEXT | Имя пользователя |
| `age` | INTEGER | Возраст (≥18) |
| `gender` | ENUM | Women / Men / Non-binary / Other |
| `photo_url` | TEXT | URL из Storage bucket `avatars` |
| `origin` | ENUM | 24 типа + Unknown |
| `location_name` | TEXT | Название города (опционально) |
| `location_geom` | GEOGRAPHY | Координаты (PostGIS) |
| `pref_age_min/max` | INTEGER | Диапазон возраста для поиска |
| `pref_gender` | TEXT[] | Предпочтения по полу |
| `pref_origins` | ENUM[] | Фильтр по Origin (null = все) |
| `onboarding_completed` | BOOLEAN | Пройден ли онбординг |
| `daily_swipes_count` | INTEGER | Счётчик свайпов за сегодня |
| `last_swipe_date` | DATE | Дата последнего свайпа |

### `swipes`

| Поле | Тип | Описание |
|------|-----|----------|
| `actor_id` | UUID | Кто свайпнул |
| `target_id` | UUID | Кого свайпнули |
| `action` | ENUM | `like` или `pass` |

**Триггер:** при `like` автоматически проверяет взаимность и создаёт `match`.

### `matches`

| Поле | Тип | Описание |
|------|-----|----------|
| `user1_id` | UUID | LEAST(id1, id2) — для уникальности |
| `user2_id` | UUID | GREATEST(id1, id2) |
| `connection_type` | TEXT | Тип связи (опционально, для быстрых запросов) |

### `messages`

| Поле | Тип | Описание |
|------|-----|----------|
| `match_id` | UUID | FK → matches |
| `sender_id` | UUID | FK → profiles |
| `content` | TEXT | Текст сообщения |
| `read_at` | TIMESTAMPTZ | Когда прочитано |

Realtime: `sb.channel('messages:{match_id}').on('postgres_changes', ...)`

### `circles`

| id | name |
|----|------|
| 1 | Relationships Circle (Siriusian, Pleiadian, Lemurian, Cassiopeian, Procyonian, Lyran) |
| 2 | Logic Circle (Arcturian, Orion, Vegan, Zeta Reticulan, Epsilon Eridan, Atlantean) |
| 3 | Energy Circle (Andromedan, Polarisian, Nibiruan, Egyptian, Mayan, Blue Avian) |
| 4 | Matter Circle (Tau Cetian, Aldebaran, Centaurian, Herculean, Anunnaki, Hyperborean) |
| 0 | Open Frequency (Unknown Origin) |

### `group_messages`

| Поле | Тип | Описание |
|------|-----|----------|
| `circle_id` | INTEGER | FK → circles |
| `sender_id` | UUID | FK → profiles |
| `content` | TEXT | Текст сообщения |

Realtime: `sb.channel('group_messages:{circle_id}').on('postgres_changes', ...)`

### `blocks`

Пользователь блокирует другого. Заблокированные не появляются в ленте.

### `reports`

Жалобы. Только INSERT для пользователей. Просматриваются через Dashboard.

---

## Edge Functions

### `GET /functions/v1/get-feed`

Возвращает очередь ленты для текущего пользователя.

**Алгоритм:**
1. Исключить уже свайпнутых и заблокированных
2. Применить фильтры (возраст, пол, Origin)
3. Рассчитать `compatibility_score` (0–100) по типу связи
4. Бустить недавно активных (+10 за 24ч, +5 за 1ч)
5. Сортировать по score, внутри одного score — случайно
6. Вернуть топ-30

**Оценки совместимости:**

| Тип связи | Score |
|-----------|-------|
| Frequency Twins | 100 |
| Eternal Reflection | 95 |
| Twin Stars | 85 |
| Star Alchemy | 80 |
| Cosmic Flow | 75 |
| Mirror Portals | 65 |
| Celestial Mentor | 60 |
| Karmic Bonds | 50 |
| Unknown | 40 |
| Shadow Contracts | 35 |
| Black Holes | 20 |

**Ответ:**
```json
{
  "profiles": [...],
  "daily_limit_reached": false,
  "remaining_swipes": 28
}
```

### `POST /functions/v1/record-swipe`

Записывает свайп и возвращает результат.

**Body:**
```json
{ "target_id": "uuid", "action": "like" }
```

**Ответ:**
```json
{
  "matched": true,
  "match_id": "uuid",
  "remaining_swipes": 27
}
```

---

## RLS — кто что видит

| Таблица | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| profiles | все авторизованные | триггер | только свой | — |
| swipes | только свои | только свои | — | — |
| matches | только участник | Edge Function | — | участник (unmatch) |
| messages | только участник | участник | — | участник |
| group_messages | все авторизованные | только свой круг | — | — |
| blocks | только свои | только свои | — | только свои |
| reports | — | только свои | — | — |

---

## Обновление feed.html для работы с Edge Functions

Заменить в `feed.html`:

```js
// БЫЛО (небезопасно — алгоритм виден в коде)
const { data: realProfiles } = await sb.from('profiles').select('*').neq('id', myUser.id)

// СТАЛО (алгоритм на сервере)
const res = await fetch(`${SUPABASE_URL}/functions/v1/get-feed`, {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
const { profiles, daily_limit_reached, remaining_swipes } = await res.json()
```

И при свайпе:

```js
// БЫЛО (нет записи в БД)
if (Math.random() > 0.5) { showMatch(profile) }

// СТАЛО
const res = await fetch(`${SUPABASE_URL}/functions/v1/record-swipe`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ target_id: profile.id, action })
})
const { matched, match_id } = await res.json()
if (matched) showMatch(profile, match_id)
```
