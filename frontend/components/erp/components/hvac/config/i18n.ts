/**
 * Минимальная инициализация i18n для hvac-admin страниц в ERP.
 * Только русские переводы — ERP работает на русском.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Инициализируем только если ещё не инициализировано
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'ru',
    fallbackLng: 'ru',
    interpolation: { escapeValue: false },
    resources: {
      ru: {
        translation: {
          'common.loading': 'Загрузка...',
          'common.actions': 'Действия',
          'common.filter': 'Фильтр',
          'news.title': 'Новости',
          'news.loadError': 'Ошибка загрузки новостей',
          'news.notFound': 'Новости не найдены',
          'manufacturers.title': 'Производители',
          'manufacturers.name': 'Название',
          'manufacturers.description': 'Описание',
          'manufacturers.website': 'Сайт',
          'manufacturers.notFound': 'Производители не найдены',
          'manufacturers.loadError': 'Ошибка загрузки',
          'manufacturers.deleteSuccess': 'Производитель удалён',
          'manufacturers.deleteError': 'Ошибка удаления',
          'brands.title': 'Бренды',
          'brands.name': 'Название',
          'brands.manufacturer': 'Производитель',
          'brands.description': 'Описание',
          'brands.notFound': 'Бренды не найдены',
          'brands.loadError': 'Ошибка загрузки',
          'brands.createSuccess': 'Бренд создан',
          'brands.updateSuccess': 'Бренд обновлён',
          'brands.saveError': 'Ошибка сохранения',
          'resources.title': 'Ресурсы',
          'resources.name': 'Название',
          'resources.description': 'Описание',
          'resources.notFound': 'Ресурсы не найдены',
        },
      },
    },
  });
}

export default i18n;
