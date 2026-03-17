# Консольные команды для диагностики

Откройте консоль браузера (F12 → Console) и используйте эти команды для диагностики и настройки.

## 🔍 Диагностика

### Проверить текущий URL API
```javascript
console.log('Current API URL:', localStorage.getItem('api_base_url') || 'https://hvac-news.ngrok.io/api');
```

### Проверить доступность API
```javascript
fetch('https://hvac-news.ngrok.io/api/')
  .then(res => res.json())
  .then(data => console.log('✅ API доступен:', data))
  .catch(err => console.error('❌ API недоступен:', err));
```

### Проверить все настройки localStorage
```javascript
console.log('All localStorage keys:', Object.keys(localStorage));
console.log('API URL:', localStorage.getItem('api_base_url'));
console.log('Auth Token:', localStorage.getItem('token') ? 'Есть' : 'Нет');
console.log('Language:', localStorage.getItem('language'));
```

## ⚙️ Настройка API URL

### Установить Ngrok (Production)
```javascript
localStorage.setItem('api_base_url', 'https://hvac-news.ngrok.io/api');
window.location.reload();
```

### Установить Localhost:8000
```javascript
localStorage.setItem('api_base_url', 'http://localhost:8000/api');
window.location.reload();
```

### Установить Localhost:8080
```javascript
localStorage.setItem('api_base_url', 'http://localhost:8080/api');
window.location.reload();
```

### Установить 127.0.0.1:8000
```javascript
localStorage.setItem('api_base_url', 'http://127.0.0.1:8000/api');
window.location.reload();
```

### Установить произвольный URL
```javascript
localStorage.setItem('api_base_url', 'https://your-domain.com/api');
window.location.reload();
```

### Сбросить на дефолтный
```javascript
localStorage.removeItem('api_base_url');
window.location.reload();
```

## 🔐 Аутентификация

### Проверить текущий токен
```javascript
const token = localStorage.getItem('token');
if (token) {
  console.log('Token exists:', token.substring(0, 50) + '...');
  
  // Декодировать JWT (не валидируя подпись)
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('Token payload:', payload);
  console.log('Expires:', new Date(payload.exp * 1000));
} else {
  console.log('No token found');
}
```

### Удалить токен (разлогиниться)
```javascript
localStorage.removeItem('token');
localStorage.removeItem('refresh_token');
console.log('Logged out');
window.location.reload();
```

## 🌐 Язык

### Проверить текущий язык
```javascript
console.log('Current language:', localStorage.getItem('language') || 'ru');
```

### Установить язык
```javascript
// Русский
localStorage.setItem('language', 'ru');
window.location.reload();

// Английский
localStorage.setItem('language', 'en');
window.location.reload();

// Немецкий
localStorage.setItem('language', 'de');
window.location.reload();

// Португальский
localStorage.setItem('language', 'pt');
window.location.reload();
```

## 🧹 Очистка

### Очистить все настройки (кроме языка)
```javascript
const lang = localStorage.getItem('language');
localStorage.clear();
if (lang) localStorage.setItem('language', lang);
console.log('Cleared all except language');
window.location.reload();
```

### Полная очистка
```javascript
localStorage.clear();
console.log('All localStorage cleared');
window.location.reload();
```

## 🧪 Тестирование API endpoints

### Проверить /api/news/
```javascript
const baseUrl = localStorage.getItem('api_base_url') || 'https://hvac-news.ngrok.io/api';
fetch(`${baseUrl}/news/`)
  .then(res => res.json())
  .then(data => console.log('News:', data))
  .catch(err => console.error('Error:', err));
```

### Проверить /api/references/manufacturers/
```javascript
const baseUrl = localStorage.getItem('api_base_url') || 'https://hvac-news.ngrok.io/api';
fetch(`${baseUrl}/references/manufacturers/`)
  .then(res => res.json())
  .then(data => console.log('Manufacturers:', data))
  .catch(err => console.error('Error:', err));
```

### Проверить с авторизацией
```javascript
const baseUrl = localStorage.getItem('api_base_url') || 'https://hvac-news.ngrok.io/api';
const token = localStorage.getItem('token');

fetch(`${baseUrl}/news/`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
  .then(res => res.json())
  .then(data => console.log('News (authorized):', data))
  .catch(err => console.error('Error:', err));
```

## 📊 Мониторинг сети

### Логировать все fetch запросы
```javascript
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('Fetch request:', args);
  return originalFetch.apply(this, args)
    .then(response => {
      console.log('Fetch response:', response.status, response.url);
      return response;
    });
};
```

### Восстановить оригинальный fetch
```javascript
// После тестирования, перезагрузите страницу или выполните:
// (если сохранили originalFetch)
window.fetch = originalFetch;
```

## 🔄 Быстрое переключение между окружениями

### Production → Local
```javascript
localStorage.setItem('api_base_url', 'http://localhost:8000/api');
location.reload();
```

### Local → Production
```javascript
localStorage.setItem('api_base_url', 'https://hvac-news.ngrok.io/api');
location.reload();
```

## 💡 Полезные однострочники

```javascript
// Проверить все
console.table({
  'API URL': localStorage.getItem('api_base_url') || 'default',
  'Token': localStorage.getItem('token') ? 'Yes' : 'No',
  'Language': localStorage.getItem('language') || 'ru'
});

// Быстрая смена на localhost
localStorage.setItem('api_base_url', 'http://localhost:8000/api'); location.reload();

// Быстрая смена на ngrok
localStorage.setItem('api_base_url', 'https://hvac-news.ngrok.io/api'); location.reload();

// Полный сброс
localStorage.clear(); location.reload();
```

---

**Совет**: Добавьте эту страницу в закладки для быстрого доступа!
