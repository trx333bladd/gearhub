# GearHub 2.4 — checkout и доставка

Магазин GearHub на HTML/CSS/JavaScript + Vite + Supabase. Фирменный логотип использует локальный шрифт Woof Dawg Demo.

## 1. Запуск проекта

Требуется Node.js 22.12+ (или 20.19+).

```bash
npm install
npm run dev
```

Открой адрес, который покажет Vite (обычно `http://localhost:5173`). Для проверки production-сборки:

```bash
npm run build
npm run preview
```

Зависимости закреплены точными версиями в `package.json`: `@supabase/supabase-js` 2.119.0 и Vite 8.3.7.

## 2. Supabase уже создан и подключён

- Project: `gearhub`
- Project ref: `exgpuvbijdvciqkjibhz`
- Region: Singapore (`ap-southeast-1`)
- Dashboard: https://supabase.com/dashboard/project/exgpuvbijdvciqkjibhz
- API URL: `https://exgpuvbijdvciqkjibhz.supabase.co`
- Storage bucket: `product-images`

Создай локальный `.env.local` из `.env.example` и добавь URL и **publishable key** проекта. Не коммить `.env.local` — он исключён из Git через `.gitignore`. Publishable key предназначен для браузерного клиента и безопасен только вместе с включённым RLS и корректными правами, которые настроены в базе. Никогда не добавляй в frontend `service_role` или secret key.

При подключении репозитория к Vercel добавь в Project Settings → Environment Variables:

- `VITE_SUPABASE_URL` = `https://exgpuvbijdvciqkjibhz.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key из `.env.local`

Build command: `npm run build`  
Output directory: `dist`

## 3. База данных

В удалённом проекте применены миграции:

- `gearhub_initial_schema`
- `gearhub_security_hardening`
- `gearhub_review_display_and_function_grants`
- `gearhub_review_submission_permissions`
- `gearhub_place_order_validation`
- `gearhub_restrict_default_grants`
- `gearhub_replace_catalog_with_user_photos`
- `gearhub_admin_role_management_and_sales`
- `gearhub_admin_role_management`

Созданы таблицы `profiles`, `categories`, `products`, `orders`, `order_items`, `reviews`, `favorites`. Включён RLS. Для нового пользователя триггер Auth создаёт профиль с ролью `customer`. Оформление заказа выполняет PostgreSQL-функция `place_order`: она проверяет доступность и остаток, берёт цены из базы, записывает позиции заказа и уменьшает остаток.

В `private`-схеме расположена служебная функция проверки администратора. В публичном API доступ к ней не открыт. Storage разрешает публичное чтение фото товаров, а загрузку/изменение/удаление — только администратору.

## 4. Авторизация и email-подтверждение

На hosted Supabase подтверждение email включено по умолчанию. После регистрации без активной сессии нужно открыть письмо и подтвердить email. В коде указано `emailRedirectTo: window.location.origin`, поэтому адрес возврата должен быть разрешён в Supabase.

В Supabase Dashboard → Authentication → URL Configuration добавь Redirect URLs:

- `http://localhost:5173/**` для локальной разработки;
- `https://<твой-домен-vercel>/**` после публикации;
- `https://<production-домен>/**` если будет отдельный домен.

Проверь Site URL и включённый Email provider в Authentication → Sign In / Providers. Для тестов встроенная почтовая отправка может быть ограничена; для настоящих пользователей настрой свой SMTP в Authentication → SMTP Settings. Не отключай подтверждение email на production.

Интерфейс поддерживает повторную отправку confirmation-письма и восстановление пароля. Если подтверждение не пришло, проверь «Спам», Redirect URLs и лимиты email. Форма регистрации/входа имеет прямой обработчик submit (не зависит от делегирования события), отключает нативный silent-block валидации и показывает ответ Supabase непосредственно под кнопкой. При отправке кнопка показывает состояние загрузки; ошибки отображаются текстом в форме и в уведомлении.

## 5. Как назначить себя администратором

1. Запусти сайт и зарегистрируйся через `log in` → `Нет аккаунта? Создать`.
2. Подтверди email по ссылке из письма, если подтверждение включено в Supabase Auth.
3. В Supabase Dashboard открой SQL Editor и выполни запрос, заменив email на тот, с которым зарегистрировался:

```sql
update public.profiles
set role = 'admin'
where lower(email) = lower('ТВОЙ_EMAIL');
```

4. Выйди из GearHub и войди снова. В личном кабинете появится Admin Panel.

Покупатель не может поменять собственную роль: клиенту доступны только имя, телефон и адрес профиля. После назначения тебя первым администратором ты сможешь менять роли других пользователей прямо из этого раздела админ-панели.

## 6. Каталог 2.2

Текущий список: Logitech G Pro X Superlight 2, AJAZZ AK820 Pro, Wooting 80HE, LAMZU Maya X, Beast X Pro, Razer Viper V4 Pro, Logitech G Pro X 2 Superstrike, MCHOSE V9 Pro, SteelSeries Arctis Nova Elite, HyperX Cloud Flight 2, FIFINE K688, MAONO PD200X, FEELWORLD PM1, ASUS ROG Swift PG27AQDP, Xiaomi G24i, ARTISAN Zero DaiDai, ARTISAN Type-99 и Elgato Stream Deck Neo.

Логотип использует локальный Woof Dawg Demo. Высота шапки и размер логотипа скорректированы, чтобы надпись не обрезалась; для мобильных экранов есть отдельные размеры.

## 7. Что уже работает

- Каталог из 18 моделей по твоему списку и 7 категорий, включая отдельную категорию ковриков Artisan. Все старые демонстрационные товары заменены.
- 9 товаров имеют скидочную цену (`compare_at_price` выше `price`); sale-страница и карточки показывают старую цену и процент скидки.
- Поиск, фильтры, сортировка, sale и карточки товаров.
- Регистрация, вход и выход через Supabase Auth.
- Личный кабинет и профиль, сохранённый в PostgreSQL.
- Корзина в браузере; оформление заказа — серверная PostgreSQL-функция с расчётом суммы и резервированием остатков.
- История заказов и статусы.
- Оформление заказа с прямым submit-обработчиком, проверкой сессии и понятным выводом ошибок; корзина очищается только после подтверждения сервера.
- В личном кабинете отображается актуальная доставка: номер заказа, статус, этапы, получатель, телефон, адрес, состав и история. Позиции заказов загружаются отдельным запросом через RLS.
- Избранное в базе данных для вошедшего пользователя.
- Добавление отзывов и модерация администратором.
- Админ-панель: добавление, редактирование, удаление товаров, загрузка фото в Supabase Storage, управление статусами заказов и модерация отзывов.
- Управление ролями: администратор видит зарегистрированные аккаунты и может выдать/снять права admin через защищённый `admin_set_user_role`; обычный пользователь не может изменить свою роль, а анонимные клиенты не могут вызвать RPC.

## 8. Перед настоящими продажами

Цены, остатки и часть описаний в этом обновлении являются предварительными значениями: ты не присылал прайс-лист. Проверь и замени цены, остатки и точные характеристики в админ-панели перед публикацией. Фотографии каталога — присланные тобой изображения, оптимизированные в WebP и сохранённые в `public/products/`. Новые изображения, загруженные через админ-панель, сохраняются в Supabase Storage.

Сейчас сайт создаёт заказы со статусом `new`, но не принимает банковскую оплату и не подключён к курьерской службе. Перед приёмом денег нужно подключить платёжного провайдера и обработку webhook на сервере/Edge Function. Также добавь домен Vercel в Supabase Auth → URL Configuration (Site URL и Redirect URLs), чтобы ссылки подтверждения email корректно возвращались на сайт.


## 9. GitHub и Vercel

Репозиторий пользователя: https://github.com/trx333bladd/gearhub

Для Vercel: Framework Preset `Vite`, Build Command `npm run build`, Output Directory `dist`, Install Command `npm install`. Добавь Environment Variables `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` в Preview и Production. `.env.local` не загружай в GitHub. После первого Deploy добавь выданный домен Vercel в Supabase Auth → URL Configuration → Redirect URLs.
