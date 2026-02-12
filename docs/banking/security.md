# Шифрование и безопасность — модуль Banking

Модуль banking обрабатывает чувствительные данные: учётные записи банковского API (client_id, client_secret), токены доступа (access_token, refresh_token). Эти данные должны храниться в зашифрованном виде.

---

## 1. Схема шифрования банковских секретов

### Алгоритм

Используется **Fernet** (симметричное шифрование на основе AES-128-CBC в режиме CBC + HMAC-SHA256 для аутентификации).

- **Библиотека:** `cryptography.fernet`
- **Ключ:** 32 байта (base64-encoded), хранится в переменной окружения `BANK_ENCRYPTION_KEY`

### Зашифрованные поля

| Модель | Поле | Тип поля | Описание |
|--------|------|----------|----------|
| BankConnection | client_id | EncryptedCharField | Client ID приложения Точки |
| BankConnection | client_secret | EncryptedCharField | Client Secret |
| BankConnection | access_token | EncryptedTextField | JWT access token |
| BankConnection | refresh_token | EncryptedTextField | Refresh token |

### Процесс шифрования/дешифрования

```
┌─────────────────────────────────────────────────────────────────┐
│  При записи в БД (get_prep_value)                                │
│  plaintext → encrypt_value() → Fernet.encrypt() → base64 → БД    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  При чтении из БД (from_db_value)                                │
│  БД (ciphertext) → decrypt_value() → Fernet.decrypt() → plaintext│
└─────────────────────────────────────────────────────────────────┘
```

### Настройка

1. Сгенерировать ключ:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

2. Добавить в `.env`:
   ```
   BANK_ENCRYPTION_KEY=ваш_сгенерированный_ключ_в_base64
   ```

3. Убедиться, что `BANK_ENCRYPTION_KEY` задан до запуска приложения. Иначе при обращении к зашифрованным полям будет `RuntimeError`.

### Разделение с SECRET_KEY

Ключ шифрования банковских данных (`BANK_ENCRYPTION_KEY`) хранится **отдельно** от Django `SECRET_KEY`. Это позволяет:

- Ротировать `SECRET_KEY` (сессии, подписи) без затрагивания банковских данных
- Ротировать банковский ключ независимо
- Соблюдать принцип разделения ответственности

---

## 2. Процедура ротации ключа шифрования

При смене `BANK_ENCRYPTION_KEY` старые зашифрованные данные **нельзя** расшифровать. Необходимо мигрировать данные до смены ключа.

### Шаги ротации

1. **Сгенерировать новый ключ:**
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

2. **Создать миграцию/скрипт для перешифрования:**
   ```python
   # manage.py shell или отдельный скрипт
   from banking.models import BankConnection
   from banking.encryption import encrypt_value, decrypt_value
   # ВНИМАНИЕ: для ротации требуется временно иметь доступ к обоим ключам
   # или выполнять миграцию в момент, когда старый ключ ещё действует
   ```

3. **Практический подход (без доступа к старому ключу):**
   - Пользователям потребуется **заново ввести** client_id и client_secret для каждого `BankConnection`
   - Выполнить полную аутентификацию через API
   - Токены будут сохранены уже с новым ключом

4. **Практический подход (с доступом к старому ключу):**
   - Сохранить старый ключ в переменной `OLD_BANK_ENCRYPTION_KEY`
   - Написать скрипт, который читает при `OLD_*`, дешифрует, шифрует при `BANK_ENCRYPTION_KEY`, сохраняет
   - Выполнить скрипт
   - Удалить `OLD_BANK_ENCRYPTION_KEY`
   - Обновить `.env` с новым `BANK_ENCRYPTION_KEY`

### Пример скрипта ротации (псевдокод)

```python
# rotate_key.py
import os
os.environ['BANK_ENCRYPTION_KEY'] = os.environ['OLD_BANK_ENCRYPTION_KEY']
# Импорт после установки старого ключа
from banking.models import BankConnection
# Читаем сырые значения (при OLD ключе они расшифруются)
# Сохраняем во временное хранилище
# Меняем ключ на новый
os.environ['BANK_ENCRYPTION_KEY'] = os.environ['NEW_BANK_ENCRYPTION_KEY']
# Перезаписываем модель — новые значения зашифруются новым ключом
```

---

## 3. Что хранится где

### В .env (переменные окружения)

| Переменная | Описание | Обязательность |
|------------|----------|----------------|
| BANK_ENCRYPTION_KEY | Ключ Fernet для шифрования банковских секретов | Обязательно для banking |
| DB_* | Параметры подключения к БД | Обязательно |
| CELERY_BROKER_URL | Redis для Celery | Обязательно для фоновых задач |

### В БД (зашифровано)

| Данные | Модель | Поле |
|--------|--------|------|
| Client ID | BankConnection | client_id |
| Client Secret | BankConnection | client_secret |
| Access Token | BankConnection | access_token |
| Refresh Token | BankConnection | refresh_token |

### В БД (открытый текст)

| Данные | Модель | Примечание |
|--------|--------|------------|
| customer_code | BankConnection | Идентификатор в банке, не секрет |
| Реквизиты получателей | BankPaymentOrder | Бизнес-данные |
| Суммы, назначения | BankTransaction, BankPaymentOrder | Бизнес-данные |
| raw_data, raw_response | BankTransaction, BankPaymentOrder | Могут содержать чувствительные данные — рассмотреть маскирование |

### Нигде не хранится

- Пароли пользователей интернет-банка (используется только OAuth2 client_credentials)
- Приватные ключи подписи (если только не используется отдельное хранилище)

---

## 4. Рекомендации по backup и восстановлению

### Backup

1. **BANK_ENCRYPTION_KEY:**
   - Хранить в секретном менеджере (HashiCorp Vault, AWS Secrets Manager, 1Password)
   - Без ключа зашифрованные данные бесполезны
   - Не включать в репозиторий и публичные backup

2. **База данных:**
   - Регулярные pg_dump с учётом RPO/RTO
   - Backup БД **бесполезен** без `BANK_ENCRYPTION_KEY`

3. **Совместное хранение:**
   - Ключ и backup БД должны восстанавливаться вместе
   - Документировать процедуру восстановления

### Восстановление

1. Восстановить БД из backup
2. Убедиться, что `BANK_ENCRYPTION_KEY` в окружении совпадает с тем, что использовался при создании backup
3. Запустить приложение; при несовпадении ключа `decrypt_value` вернёт пустую строку, логируется ошибка
4. При ошибке расшифровки — пользователям нужно заново ввести credentials и пройти аутентификацию

### Дополнительные меры

- **Ограничение доступа к БД:** только сервисный пользователь приложения
- **Шифрование БД на уровне СУБД:** TDE (Transparent Data Encryption) для дополнительной защиты
- **Аудит:** логировать доступ к банковским операциям (BankPaymentOrderEvent уже даёт аудит по платежам)
- **HTTPS:** обязателен для production; webhook должен быть доступен по HTTPS
