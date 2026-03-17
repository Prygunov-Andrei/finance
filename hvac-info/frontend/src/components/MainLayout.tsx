import React, { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { User, Building2, Tag, Globe, Mail, FileText, Clock, Edit, AlertTriangle, Settings, BarChart3, Zap, Calculator } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import logo from '../assets/logo.png';
import referencesService from '../services/referencesService';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, user } = useAuth();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const location = useLocation();
  const [counts, setCounts] = useState({
    manufacturers: 0,
    brands: 0,
    resources: 0,
  });

  const isActive = (path: string) => location.pathname === path;
  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    loadCounts();
  }, [language]);

  const loadCounts = async () => {
    try {
      const results = await Promise.allSettled([
        referencesService.getManufacturers(language),
        referencesService.getBrands(language),
        referencesService.getResources(language),
      ]);
      
      setCounts({
        manufacturers: results[0].status === 'fulfilled' ? results[0].value.length : 0,
        brands: results[1].status === 'fulfilled' ? results[1].value.length : 0,
        resources: results[2].status === 'fulfilled' ? results[2].value.length : 0,
      });
    } catch (err) {
      console.error('Error loading counts:', err);
      // Устанавливаем счетчики в 0 при ошибке
      setCounts({
        manufacturers: 0,
        brands: 0,
        resources: 0,
      });
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <nav className="flex-shrink-0 border-b border-border bg-card">
        <div className="px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src={logo} alt="HVAC News Logo" className="w-12 h-12" />
            <h4>{t('app.title')}</h4>
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link 
                  to="/dashboard" 
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer hidden sm:block"
                >
                  {user?.first_name} {user?.last_name}
                </Link>
                <Link to="/dashboard" className="sm:hidden">
                  <User className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                </Link>
              </>
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link to="/login">{t('auth.login')}</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">{t('auth.register')}</Link>
                </Button>
              </>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      </nav>

      {/* Main Content with Sidebar - Scrollable */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Fixed, scrollable if content is too long */}
        <aside className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
          <div className="p-4 space-y-2 flex-1 overflow-y-auto">
            {/* Админские ссылки */}
            {isAdmin && (
              <>
                <div className="px-4 py-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Управление
                  </p>
                </div>
                
                <Link
                  to="/news/create"
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive('/news/create') 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <Edit className="w-5 h-5 flex-shrink-0" />
                  <span>Создать новость</span>
                </Link>

                <Link
                  to="/drafts"
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive('/drafts') 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <FileText className="w-5 h-5 flex-shrink-0" />
                  <span>Черновики</span>
                </Link>

                <Link
                  to="/scheduled"
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive('/scheduled') 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <Clock className="w-5 h-5 flex-shrink-0" />
                  <span>Запланированные</span>
                </Link>

                <Link
                  to="/news/not-found"
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive('/news/not-found') 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>Не найдено</span>
                </Link>

                <div className="my-2 border-t border-border" />
                
                <div className="px-4 py-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Справочники
                  </p>
                </div>
              </>
            )}
            
            <Link
              to="/manufacturers"
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/manufacturers') 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <Building2 className="w-5 h-5 flex-shrink-0" />
              <span className="flex items-baseline gap-1">
                {t('nav.manufacturers')}
                {counts.manufacturers > 0 && (
                  <span className="text-sm opacity-70">({counts.manufacturers})</span>
                )}
              </span>
            </Link>

            <Link
              to="/brands"
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/brands') 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <Tag className="w-5 h-5 flex-shrink-0" />
              <span className="flex items-baseline gap-1">
                {t('nav.brands')}
                {counts.brands > 0 && (
                  <span className="text-sm opacity-70">({counts.brands})</span>
                )}
              </span>
            </Link>

            <Link
              to="/resources"
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/resources') 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <Globe className="w-5 h-5 flex-shrink-0" />
              <span className="flex items-baseline gap-1">
                {t('nav.resources')}
                {counts.resources > 0 && (
                  <span className="text-sm opacity-70">({counts.resources})</span>
                )}
              </span>
            </Link>

            <a
              href="/smeta/"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-muted text-foreground"
            >
              <Calculator className="w-5 h-5 flex-shrink-0" />
              <span>Расчёт сметы</span>
            </a>

            {/* Настройки и аналитика - только для админов */}
            {isAdmin && (
              <>
                <div className="my-2 border-t border-border" />
                
                <div className="px-4 py-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Система
                  </p>
                </div>

                <Link
                  to="/search-settings"
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive('/search-settings') 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <Settings className="w-5 h-5 flex-shrink-0" />
                  <span>Настройки поиска</span>
                </Link>

                <Link
                  to="/discovery-analytics"
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive('/discovery-analytics') 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <BarChart3 className="w-5 h-5 flex-shrink-0" />
                  <span>Аналитика поиска</span>
                </Link>
              </>
            )}
          </div>

          {/* Footer внизу сайдбара */}
          <div className="p-4 border-t border-border space-y-2">
            <Link
              to="/feedback"
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/feedback') 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <Mail className="w-5 h-5 flex-shrink-0" />
              <span>{t('footer.contactUs')}</span>
            </Link>
            
            <div className="px-4 pt-2 text-xs text-muted-foreground text-center">
              © 2024 HVAC News
              <br />
              {t('footer.allRightsReserved')}
            </div>
          </div>
        </aside>

        {/* Main Content Area - Scrollable */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}