import { ReactNode, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { 
  Home, Users, Building2, FileText, DollarSign, Settings, 
  LogOut, Menu, ChevronRight, List, Briefcase, Star,
  FolderOpen, ClipboardList, Wrench, CreditCard, Mail,
  Package, Layers, CheckSquare, Sparkles
} from 'lucide-react';
import { Button } from './ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback } from './ui/avatar';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBadge } from './NotificationBadge';
import logo from '../assets/logo.png';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
  user?: { username: string };
}

interface MenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Home className="w-5 h-5" />, path: '/dashboard' },
  { id: 'counterparties', label: 'Контрагенты', icon: <Users className="w-5 h-5" />, path: '/counterparties' },
  { id: 'objects', label: 'Объекты', icon: <Building2 className="w-5 h-5" />, path: '/objects' },
  { 
    id: 'pricelists', 
    label: 'Прайс-листы', 
    icon: <List className="w-5 h-5" />, 
    path: '/pricelists',
    children: [
      { id: 'price-lists', label: 'Прайс-листы', icon: <FileText className="w-4 h-4" />, path: '/price-lists' },
      { id: 'work-items', label: 'Работы', icon: <Briefcase className="w-4 h-4" />, path: '/work-items' },
      { id: 'work-sections', label: 'Разделы работ', icon: <FileText className="w-4 h-4" />, path: '/work-sections' },
      { id: 'worker-grades', label: 'Разряды', icon: <Star className="w-4 h-4" />, path: '/worker-grades' },
      { id: 'worker-grade-skills', label: 'Навыки разрядов', icon: <Star className="w-4 h-4" />, path: '/worker-grade-skills' },
    ]
  },
  { 
    id: 'estimates', 
    label: 'Проекты и Сметы', 
    icon: <FolderOpen className="w-5 h-5" />, 
    path: '/estimates',
    children: [
      { id: 'projects', label: 'Проекты', icon: <FolderOpen className="w-4 h-4" />, path: '/estimates/projects' },
      { id: 'estimates-list', label: 'Сметы', icon: <ClipboardList className="w-4 h-4" />, path: '/estimates/estimates' },
      { id: 'mounting-estimates', label: 'Монтажные сметы', icon: <Wrench className="w-4 h-4" />, path: '/estimates/mounting-estimates' },
    ]
  },
  { 
    id: 'proposals', 
    label: 'Предложения', 
    icon: <Briefcase className="w-5 h-5" />, 
    path: '/proposals',
    children: [
      { id: 'technical-proposals', label: 'ТКП', icon: <FileText className="w-4 h-4" />, path: '/proposals/technical-proposals' },
      { id: 'mounting-proposals', label: 'МП', icon: <Wrench className="w-4 h-4" />, path: '/proposals/mounting-proposals' },
      { id: 'front-of-work-items', label: 'Фронт работ', icon: <ClipboardList className="w-4 h-4" />, path: '/proposals/front-of-work-items' },
      { id: 'mounting-conditions', label: 'Условия для МП', icon: <FileText className="w-4 h-4" />, path: '/proposals/mounting-conditions' },
    ]
  },
  { 
    id: 'contracts', 
    label: 'Договоры', 
    icon: <FileText className="w-5 h-5" />, 
    path: '/contracts',
    children: [
      { id: 'contracts-list', label: 'Договоры', icon: <FileText className="w-4 h-4" />, path: '/contracts' },
      { id: 'framework-contracts', label: 'Рамочные договоры', icon: <FileText className="w-4 h-4" />, path: '/contracts/framework-contracts' },
      { id: 'acts', label: 'Акты', icon: <FileText className="w-4 h-4" />, path: '/contracts/acts' },
    ]
  },
  { 
    id: 'payments', 
    label: 'Платежи', 
    icon: <DollarSign className="w-5 h-5" />, 
    path: '/payments',
    children: [
      { id: 'payments-list', label: 'Платежи', icon: <DollarSign className="w-4 h-4" />, path: '/payments' },
      { id: 'payment-registry', label: 'Реестр платежей', icon: <CreditCard className="w-4 h-4" />, path: '/payment-registry' },
    ]
  },
  { 
    id: 'catalog', 
    label: 'Каталог', 
    icon: <Package className="w-5 h-5" />, 
    path: '/catalog',
    children: [
      { id: 'catalog-categories', label: 'Категории товаров', icon: <Layers className="w-4 h-4" />, path: '/catalog/categories' },
      { id: 'catalog-products', label: 'Товары и услуги', icon: <Package className="w-4 h-4" />, path: '/catalog/products' },
      { id: 'catalog-moderation', label: 'Модерация товаров', icon: <CheckSquare className="w-4 h-4" />, path: '/catalog/moderation' },
    ]
  },
  { id: 'communications', label: 'Переписка', icon: <Mail className="w-5 h-5" />, path: '/communications' },
  { 
    id: 'settings', 
    label: 'Настройки', 
    icon: <Settings className="w-5 h-5" />, 
    path: '/settings',
    children: [
      { id: 'settings-companies', label: 'Мои компании', icon: <Building2 className="w-4 h-4" />, path: '/settings' },
      { id: 'settings-accounts', label: 'Счета', icon: <CreditCard className="w-4 h-4" />, path: '/settings' },
      { id: 'settings-llm', label: 'LLM-провайдеры', icon: <Sparkles className="w-4 h-4" />, path: '/settings/llm' },
    ]
  },
];

const pageTitles: Record<string, string> = {
  dashboard: 'Панель управления',
  counterparties: 'Контрагенты',
  objects: 'Объекты',
  contracts: 'Договоры',
  'framework-contracts': 'Рамочные договоры',
  'contracts/acts': 'Акты',
  payments: 'Платежи',
  'payment-registry': 'Реестр платежей',
  'proposals/technical-proposals': 'ТКП',
  'proposals/mounting-proposals': 'МП',
  'proposals/front-of-work-items': 'Фронт работ',
  'proposals/mounting-conditions': 'Условия для МП',
  'estimates/projects': 'Проекты',
  'estimates/estimates': 'Сметы',
  'estimates/mounting-estimates': 'Монтажные сметы',
  'price-lists': 'Прайс-листы',
  'work-items': 'Работы',
  'worker-grades': 'Разряды',
  'work-sections': 'Разделы работ',
  'worker-grade-skills': 'Навыки разрядов',
  'catalog/categories': 'Категории товаров',
  'catalog/products': 'Товары и услуги',
  'catalog/moderation': 'Модерация товаров',
  communications: 'Переписка',
  settings: 'Настройки',
  'settings/llm': 'Настройки LLM',
};

export function Layout({ children, onLogout, user }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['contracts', 'proposals', 'pricelists', 'estimates', 'catalog']);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) : 256;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Сохранение ширины в localStorage
  useEffect(() => {
    localStorage.setItem('sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  // Обработка изменения размера
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      // Ограничения: минимум 200px, максимум 400px
      if (newWidth >= 200 && newWidth <= 400) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const getUserInitials = (username?: string) => {
    if (!username) return 'U';
    return username
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuId) 
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`relative bg-white border-r border-gray-200 flex flex-col ${
          isSidebarOpen ? '' : 'w-20'
        }`}
        ref={sidebarRef}
        style={{ width: isSidebarOpen ? sidebarWidth : 64 }}
      >
        {/* Header with Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-3 hover:opacity-70 transition-opacity"
            >
              {isSidebarOpen ? (
                <img src={logo} alt="Август" className="h-10" />
              ) : (
                <img src={logo} alt="Август" className="h-10" />
              )}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="h-8 w-8 p-0"
            >
              <Menu className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            // Проверяем, активен ли какой-либо дочерний пункт
            const isAnyChildActive = item.children?.some(child => 
              location.pathname === child.path
            ) || false;
            
            // Родительский пункт активен, если совпадает его путь ИЛИ активен любой дочерний пункт
            const isActive = location.pathname === item.path || 
                            (item.path !== '/' && location.pathname.startsWith(item.path)) ||
                            isAnyChildActive;
            
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (item.children) {
                      toggleMenu(item.id);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {item.icon}
                  </div>
                  {isSidebarOpen && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.id === 'contracts' && <NotificationBadge type="expiring-contracts" />}
                    </>
                  )}
                </button>
                {item.children && isSidebarOpen && expandedMenus.includes(item.id) && (
                  <div className="pl-8">
                    {item.children.map(child => {
                      // ИСПРАВЛЕНИЕ: используем точное совпадение для дочерних пунктов
                      // чтобы избежать конфликтов при схожих путях (например /contracts и /contracts/acts)
                      const isChildActive = location.pathname === child.path;
                      
                      return (
                        <button
                          key={child.id}
                          onClick={() => navigate(child.path)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                            isChildActive
                              ? 'bg-blue-50 text-blue-600'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {child.icon}
                          </div>
                          {isSidebarOpen && (
                            <span className="truncate">{child.label}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          {isSidebarOpen ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 hover:bg-gray-50 rounded-lg p-2 transition-colors">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                      {getUserInitials(user?.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user?.username || 'Пользоватеь'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Администратор
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Мой аккаунт</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Настройки
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex justify-center">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                      {getUserInitials(user?.username)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {user?.username || 'Пользователь'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Настройки
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Resizer */}
        {isSidebarOpen && (
          <div
            className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors ${
              isResizing ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-400'
            }`}
            onMouseDown={handleMouseDown}
            style={{
              boxShadow: isResizing ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none'
            }}
          />
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Breadcrumbs and Search */}
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between gap-6">
            {/* Breadcrumbs */}
            <div className="flex items-center text-sm text-gray-500">
              <button 
                onClick={() => navigate('/')}
                className="hover:text-gray-700 transition-colors"
              >
                Главная
              </button>
              {location.pathname !== '/' && (
                <>
                  <ChevronRight className="w-4 h-4 mx-2" />
                  <span className="text-gray-900 font-medium">
                    {pageTitles[location.pathname.slice(1)] || location.pathname.slice(1)}
                  </span>
                </>
              )}
            </div>

            {/* Global Search */}
            <GlobalSearch />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}