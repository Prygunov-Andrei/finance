import { ReactNode, useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { 
  Home, Users, Building2, FileText, DollarSign, Settings, 
  LogOut, Menu, ChevronRight, List, Briefcase,
  FolderOpen, ClipboardList, Wrench, CreditCard, Mail,
  Package, CheckSquare, Landmark, Receipt,
  Truck, CalendarClock, TrendingUp, BarChart3, ShoppingCart, Link2,
  ExternalLink, HardHat, Search, BookOpen, HelpCircle, Archive,
  Calendar, PieChart, Wallet, Scale, Megaphone, Calculator, Globe, Phone
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
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBadge } from './NotificationBadge';
import { usePermissions } from '../hooks/usePermissions';
import { useBreadcrumb } from '../hooks/useBreadcrumb';
import logo from '../assets/logo.png';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
  user?: { username: string; photo_url?: string };
}

interface MenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
  children?: MenuItem[];
  isShortcut?: boolean;
  isSeparator?: boolean;
  section?: string;
  shortcutSection?: string;
  subGroupLabel?: string;
}

const menuItems: MenuItem[] = [
  // 1. ПУНКТ УПРАВЛЕНИЯ
  { id: 'dashboard', label: 'Пункт управления', icon: <Home className="w-5 h-5" />, path: '/dashboard', section: 'dashboard' },

  // 2. КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ
  {
    id: 'commercial',
    label: 'Коммерческие предложения',
    icon: <Briefcase className="w-5 h-5" />,
    path: '/commercial',
    section: 'commercial',
    children: [
      { id: 'kanban-cp', label: 'Канбан КП', icon: <ClipboardList className="w-4 h-4" />, path: '/commercial/kanban', section: 'commercial.kanban' },
      { id: 'technical-proposals', label: 'ТКП', icon: <FileText className="w-4 h-4" />, path: '/proposals/technical-proposals', section: 'commercial.tkp' },
      { id: 'mounting-proposals', label: 'МП', icon: <Wrench className="w-4 h-4" />, path: '/proposals/mounting-proposals', section: 'commercial.mp' },
      { id: 'commercial-estimates', label: 'Сметы', icon: <FileText className="w-4 h-4" />, path: '/estimates/estimates', section: 'commercial.estimates' },
      { id: 'commercial-price-lists', label: 'Прайс-листы', icon: <List className="w-4 h-4" />, path: '/price-lists', section: 'commercial.estimates', isShortcut: true, shortcutSection: 'goods.pricelists' },
      { id: 'commercial-instructions', label: 'Инструкции', icon: <BookOpen className="w-4 h-4" />, path: '/commercial/instructions' },
    ],
  },

  // 3. ОБЪЕКТЫ
  { id: 'objects', label: 'Объекты', icon: <Building2 className="w-5 h-5" />, path: '/objects', section: 'objects' },

  // 4. ФИНАНСЫ
  {
    id: 'finance',
    label: 'Финансы',
    icon: <DollarSign className="w-5 h-5" />,
    path: '/finance',
    section: 'finance',
    children: [
      { id: 'finance-dashboard', label: 'Дашборд Финансы', icon: <BarChart3 className="w-4 h-4" />, path: '/finance/dashboard', section: 'finance.dashboard' },
      { id: 'finance-payments', label: 'Платежи', icon: <CreditCard className="w-4 h-4" />, path: '/finance/payments', section: 'finance.payments' },
      { id: 'finance-statements', label: 'Выписки за период', icon: <Landmark className="w-4 h-4" />, path: '/bank-statements', section: 'finance.statements' },
      { id: 'finance-recurring', label: 'Периодические платежи', icon: <CalendarClock className="w-4 h-4" />, path: '/supply/recurring', section: 'finance.recurring' },
      { id: 'finance-debtors', label: 'Дебиторская задолженность', icon: <Scale className="w-4 h-4" />, path: '/finance/debtors', section: 'finance.debtors' },
      { id: 'finance-accounting', label: 'Бухгалтерия', icon: <Calculator className="w-4 h-4" />, path: '/finance/accounting', section: 'finance.accounting' },
      { id: 'finance-budget', label: 'Расходный бюджет', icon: <Wallet className="w-4 h-4" />, path: '/finance/budget', section: 'finance.budget' },
      { id: 'finance-indicators', label: 'Финансовые показатели', icon: <PieChart className="w-4 h-4" />, path: '/finance/indicators', section: 'finance.indicators' },
      { id: 'finance-instructions', label: 'Инструкции', icon: <BookOpen className="w-4 h-4" />, path: '/finance/instructions' },
    ],
  },

  // 5. ДОГОВОРЫ
  {
    id: 'contracts',
    label: 'Договоры',
    icon: <FileText className="w-5 h-5" />,
    path: '/contracts',
    section: 'contracts',
    children: [
      { id: 'framework-contracts', label: 'Рамочные Договора', icon: <FileText className="w-4 h-4" />, path: '/contracts/framework-contracts', section: 'contracts.framework' },
      { id: 'object-contracts', label: 'Договора по объектам', icon: <FileText className="w-4 h-4" />, path: '/contracts', section: 'contracts.object_contracts' },
      { id: 'estimates', label: 'Сметы', icon: <ClipboardList className="w-4 h-4" />, path: '/estimates/estimates', section: 'contracts.estimates' },
      { id: 'acts', label: 'Акты', icon: <FileText className="w-4 h-4" />, path: '/contracts/acts', section: 'contracts.acts' },
      { id: 'household-contracts', label: 'Хозяйственные Договора', icon: <FileText className="w-4 h-4" />, path: '/contracts/household', section: 'contracts.household' },
      { id: 'contracts-instructions', label: 'Инструкции', icon: <FileText className="w-4 h-4" />, path: '/contracts/instructions' },
    ],
  },

  // 6. СНАБЖЕНИЕ И СКЛАД
  {
    id: 'supply',
    label: 'Снабжение и Склад',
    icon: <Truck className="w-5 h-5" />,
    path: '/supply',
    section: 'supply',
    children: [
      { id: 'kanban-supply', label: 'Канбан Снабжения', icon: <ShoppingCart className="w-4 h-4" />, path: '/kanban/supply', section: 'supply.kanban' },
      { id: 'supply-invoices', label: 'Счета на оплату', icon: <Receipt className="w-4 h-4" />, path: '/finance/payments?tab=invoices', section: 'supply.invoices', isShortcut: true, shortcutSection: 'finance' },
      { id: 'supply-drivers', label: 'Календарь водителей', icon: <Calendar className="w-4 h-4" />, path: '/supply/drivers', section: 'supply.drivers' },
      { id: 'supply-moderation', label: 'Модерация товаров', icon: <CheckSquare className="w-4 h-4" />, path: '/catalog/moderation', section: 'supply.moderation', isShortcut: true, shortcutSection: 'goods.moderation' },
      { id: 'warehouse', label: 'Склад: Остатки', icon: <Package className="w-4 h-4" />, path: '/warehouse', section: 'supply.warehouse' },
      { id: 'supply-counterparties', label: 'Поставщики', icon: <Users className="w-4 h-4" />, path: '/counterparties', section: 'settings.counterparties', isShortcut: true, shortcutSection: 'settings.counterparties' },
    ],
  },

  // 7. ТОВАРЫ И УСЛУГИ
  {
    id: 'goods',
    label: 'Товары и услуги',
    icon: <Package className="w-5 h-5" />,
    path: '/goods',
    section: 'goods',
    children: [
      // --- Каталог закупок ---
      { id: 'goods-categories', label: 'Категории', icon: <FolderOpen className="w-4 h-4" />, path: '/catalog/categories', section: 'goods.categories', subGroupLabel: 'Каталог закупок' },
      { id: 'goods-products', label: 'Номенклатура', icon: <Package className="w-4 h-4" />, path: '/catalog/products', section: 'goods.catalog' },
      { id: 'goods-moderation', label: 'Модерация', icon: <CheckSquare className="w-4 h-4" />, path: '/catalog/moderation', section: 'goods.moderation' },
      { id: 'goods-supplier-catalogs', label: 'Каталоги поставщиков', icon: <FileText className="w-4 h-4" />, path: '/catalog/supplier-catalogs', section: 'goods.catalog' },
      // --- Работы и расценки ---
      { id: 'goods-work-items', label: 'Каталог работ', icon: <Wrench className="w-4 h-4" />, path: '/work-items', section: 'goods.works', subGroupLabel: 'Работы и расценки' },
      { id: 'goods-work-sections', label: 'Разделы работ', icon: <FolderOpen className="w-4 h-4" />, path: '/work-sections', section: 'goods.works' },
      { id: 'goods-price-lists', label: 'Прайс-листы', icon: <List className="w-4 h-4" />, path: '/price-lists', section: 'goods.pricelists' },
      { id: 'goods-worker-grades', label: 'Разряды монтажников', icon: <Users className="w-4 h-4" />, path: '/worker-grades', section: 'goods.grades' },
      { id: 'goods-worker-grade-skills', label: 'Навыки разрядов', icon: <FileText className="w-4 h-4" />, path: '/worker-grade-skills', section: 'goods.grades' },
    ],
  },

  // 8. ПТО
  {
    id: 'pto',
    label: 'ПТО',
    icon: <HardHat className="w-5 h-5" />,
    path: '/pto',
    section: 'pto',
    children: [
      { id: 'pto-projects', label: 'Проекты', icon: <FolderOpen className="w-4 h-4" />, path: '/estimates/projects', section: 'pto.projects' },
      { id: 'pto-production', label: 'Производственная документация', icon: <FileText className="w-4 h-4" />, path: '/pto/production-docs', section: 'pto.production' },
      { id: 'pto-executive', label: 'Исполнительная документация', icon: <FileText className="w-4 h-4" />, path: '/pto/executive-docs', section: 'pto.executive' },
      { id: 'pto-samples', label: 'Образцы документов', icon: <FileText className="w-4 h-4" />, path: '/pto/samples', section: 'pto.samples' },
      { id: 'pto-knowledge', label: 'Руководящие документы', icon: <BookOpen className="w-4 h-4" />, path: '/pto/knowledge-base', section: 'pto.knowledge' },
    ],
  },

  // 8. МАРКЕТИНГ
  {
    id: 'marketing',
    label: 'Маркетинг',
    icon: <Megaphone className="w-5 h-5" />,
    path: '/marketing',
    section: 'marketing',
    children: [
      { id: 'marketing-objects', label: 'Канбан поиска объектов', icon: <ClipboardList className="w-4 h-4" />, path: '/marketing/objects', section: 'marketing.kanban' },
      { id: 'marketing-potential-customers', label: 'Потенциальные заказчики', icon: <Users className="w-4 h-4" />, path: '/marketing/potential-customers', section: 'marketing.potential_customers' },
      { id: 'marketing-objects-list', label: 'Объекты', icon: <Building2 className="w-4 h-4" />, path: '/marketing/objects-list', isShortcut: true, shortcutSection: 'objects' },
      { id: 'marketing-executors', label: 'Поиск Исполнителей', icon: <Search className="w-4 h-4" />, path: '/marketing/executors', section: 'marketing.executors' },
    ],
  },

  // 9. ПОРТАЛ СМЕТ
  {
    id: 'portal',
    label: 'Портал смет',
    icon: <Globe className="w-5 h-5" />,
    path: '/portal',
    section: 'commercial.estimates',
    children: [
      { id: 'portal-requests', label: 'Запросы', icon: <FileText className="w-4 h-4" />, path: '/portal/requests', section: 'commercial.estimates' },
      { id: 'portal-callbacks', label: 'Заявки на звонок', icon: <Phone className="w-4 h-4" />, path: '/portal/callbacks', section: 'commercial.estimates' },
      { id: 'portal-settings', label: 'Настройки', icon: <Settings className="w-4 h-4" />, path: '/portal/settings', section: 'commercial.estimates' },
    ],
  },

  // 10. ПЕРЕПИСКА
  { id: 'communications', label: 'Переписка', icon: <Mail className="w-5 h-5" />, path: '/communications', section: 'communications' },

  // 10. СПРАВОЧНИКИ И НАСТРОЙКИ
  {
    id: 'references',
    label: 'Справочники и Настройки',
    icon: <BookOpen className="w-5 h-5" />,
    path: '/references',
    section: 'settings',
    children: [
      { id: 'ref-work-conditions', label: 'Фронт работ и монтажные условия', icon: <ClipboardList className="w-4 h-4" />, path: '/references/work-conditions', section: 'settings.work_conditions' },
      { id: 'ref-personnel', label: 'Персонал', icon: <Users className="w-4 h-4" />, path: '/personnel', section: 'settings.personnel' },
      { id: 'ref-counterparties', label: 'Контрагенты', icon: <Users className="w-4 h-4" />, path: '/counterparties', section: 'settings.counterparties' },
      { id: 'ref-settings', label: 'Настройки', icon: <Settings className="w-4 h-4" />, path: '/settings', section: 'settings.config' },
      { id: 'ref-supplier-integrations', label: 'Интеграции поставщиков', icon: <Link2 className="w-4 h-4" />, path: '/settings/integrations', section: 'supply.integrations' },
      { id: 'ref-instructions', label: 'Инструкции', icon: <BookOpen className="w-4 h-4" />, path: '/settings/instructions' },
    ],
  },

  // 11. СПРАВКА
  { id: 'help', label: 'Справка', icon: <HelpCircle className="w-5 h-5" />, path: '/help', section: 'help' },

  // --- Разделитель ---
  { id: 'separator', label: '', icon: <></>, path: '', isSeparator: true },

  // НЕРАСПРЕДЕЛЁННОЕ
  {
    id: 'unassigned',
    label: 'Нераспределённое',
    icon: <Archive className="w-5 h-5" />,
    path: '/unassigned',
    children: [
      { id: 'legacy-orders', label: 'Платёжные поручения', icon: <Receipt className="w-4 h-4" />, path: '/bank-payment-orders' },
      { id: 'legacy-bitrix-requests', label: 'Запросы из Битрикс', icon: <ShoppingCart className="w-4 h-4" />, path: '/supply/requests' },
      { id: 'legacy-bitrix-settings', label: 'Настройки Битрикс24', icon: <Link2 className="w-4 h-4" />, path: '/settings/bitrix' },
      { id: 'legacy-supply-dashboard', label: 'Дашборд снабжения', icon: <BarChart3 className="w-4 h-4" />, path: '/supply/dashboard' },
    ],
  },
];

const pageTitles: Record<string, string> = {
  // 1. Пункт управления
  dashboard: 'Пункт управления',
  // 2. Коммерческие предложения
  'commercial/kanban': 'Канбан КП',
  'commercial/instructions': 'Инструкции КП',
  'proposals/technical-proposals': 'ТКП',
  'proposals/mounting-proposals': 'МП',
  'price-lists': 'Прайс-листы',
  'proposals/front-of-work-items': 'Фронт работ',
  'proposals/mounting-conditions': 'Условия для МП',
  // 3. Объекты
  objects: 'Объекты',
  // 4. Финансы
  'finance/payments': 'Платежи',
  'finance/dashboard': 'Дашборд Финансы',
  'supply/invoices': 'Счета на оплату',
  'supply/income': 'Входящие платежи',
  'payment-registry': 'Реестр оплат',
  'bank-statements': 'Выписки за период',
  'supply/recurring': 'Периодические платежи',
  'finance/debtors': 'Дебиторская задолженность',
  'finance/accounting': 'Бухгалтерия',
  'finance/budget': 'Расходный бюджет',
  'finance/indicators': 'Финансовые показатели',
  // 5. Договоры
  contracts: 'Договоры по объектам',
  'contracts/framework-contracts': 'Рамочные Договора',
  'estimates/estimates': 'Сметы',
  'estimates/mounting-estimates': 'Монтажные сметы',
  'contracts/acts': 'Акты',
  'contracts/household': 'Хозяйственные Договора',
  // 6. Снабжение и Склад
  'kanban/supply': 'Канбан Снабжения',
  'supply/drivers': 'Календарь водителей',
  'catalog/moderation': 'Модерация товаров',
  warehouse: 'Склад: Остатки',
  counterparties: 'Контрагенты',
  'settings/integrations': 'Интеграции поставщиков',
  // 7. ПТО
  'estimates/invoices': 'Счета поставщиков',
  'estimates/projects': 'Проекты',
  'pto/production-docs': 'Производственная документация',
  'pto/executive-docs': 'Исполнительная документация',
  'pto/samples': 'Образцы документов',
  'pto/knowledge-base': 'Руководящие документы',
  // 8. Маркетинг
  'marketing/objects': 'Канбан поиска объектов',
  'marketing/potential-customers': 'Потенциальные заказчики',
  'marketing/objects-list': 'Объекты (Маркетинг)',
  'marketing/executors': 'Поиск Исполнителей',
  // 9. Переписка
  communications: 'Переписка',
  // 7. Товары и услуги
  'catalog/categories': 'Категории',
  'catalog/products': 'Номенклатура',
  'catalog/supplier-catalogs': 'Каталоги поставщиков',
  'work-items': 'Каталог работ',
  'work-sections': 'Разделы работ',
  'worker-grades': 'Разряды монтажников',
  'worker-grade-skills': 'Навыки разрядов',
  // 11. Справочники и Настройки
  'references/work-conditions': 'Фронт работ и монтажные условия',
  personnel: 'Персонал',
  settings: 'Настройки',
  'settings/instructions': 'Инструкции',
  'settings/llm': 'Настройки LLM',
  // 11. Справка
  help: 'Справка',
  // Legacy / Нераспределённое
  payments: 'Платежи (legacy)',
  'bank-payment-orders': 'Платёжные поручения',
  'supply/requests': 'Запросы из Битрикс',
  'settings/bitrix': 'Интеграция с Битрикс24',
  'supply/dashboard': 'Дашборд снабжения',
};

// Menu group paths that have no direct route (only children) — clicking them in breadcrumbs should be non-navigable
const menuGroupPaths = new Set(
  menuItems.filter(item => item.children?.length).map(item => item.path)
);

// Build path-to-parent mapping for hierarchical breadcrumbs
const pathToParent: Record<string, { label: string; path: string }> = {};
for (const item of menuItems) {
  if (item.children) {
    for (const child of item.children) {
      const cleanPath = child.path.split('?')[0].slice(1);
      if (cleanPath && !pathToParent[cleanPath]) {
        pathToParent[cleanPath] = { label: item.label, path: item.path };
      }
    }
  }
}
// Manual parents for pages that aren't direct menu children
pathToParent['supply/invoices'] = { label: 'Финансы', path: '/finance/payments' };
pathToParent['supply/income'] = { label: 'Финансы', path: '/finance/payments' };
pathToParent['payment-registry'] = { label: 'Финансы', path: '/finance/payments' };
pathToParent['estimates/invoices'] = { label: 'Сметы', path: '/estimates/estimates' };

export function Layout({ children, onLogout, user }: LayoutProps) {
  const { hasAccess } = usePermissions();
  const { detailLabel, parentCrumb } = useBreadcrumb();

  const filteredMenuItems = useMemo(() => {
    return menuItems
      .map((item) => {
        if (item.isSeparator) return item;
        if (item.section && !hasAccess(item.section)) return null;

        if (item.children) {
          const visibleChildren = item.children.filter((child) => {
            if (child.section && !hasAccess(child.section)) return false;
            if (child.isShortcut && child.shortcutSection && !hasAccess(child.shortcutSection)) return false;
            return true;
          });
          if (visibleChildren.length === 0 && item.section) return null;
          return { ...item, children: visibleChildren };
        }
        return item;
      })
      .filter(Boolean) as MenuItem[];
  }, [hasAccess]);

  const homePath = useMemo(() => {
    const first = filteredMenuItems.find((item) => !item.isSeparator && item.path);
    if (!first) return '/dashboard';
    if (first.children?.length) return first.children[0].path;
    return first.path;
  }, [filteredMenuItems]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['commercial', 'finance', 'contracts', 'supply', 'goods', 'pto', 'references']);
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
              onClick={() => navigate(homePath)}
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
          {filteredMenuItems.map((item) => {
            // Разделитель
            if (item.isSeparator) {
              if (!isSidebarOpen) return null;
              return (
                <div key={item.id} className="py-2">
                  <div className="border-t border-gray-200" />
                </div>
              );
            }

            const isUnassigned = item.id === 'unassigned';

            // Проверяем, активен ли какой-либо дочерний пункт
            const isAnyChildActive = item.children?.some(child => 
              location.pathname === child.path
            ) || false;
            
            // Родительский пункт активен, если совпадает его путь ИЛИ активен любой дочерний пункт
            const isActive = location.pathname === item.path || 
                            (item.path !== '/' && item.path !== '' && location.pathname.startsWith(item.path)) ||
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
                      : isUnassigned
                        ? 'text-gray-400 hover:bg-gray-50'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {item.icon}
                  </div>
                  {isSidebarOpen && (
                    <>
                      <span className={`truncate ${isUnassigned ? 'text-xs uppercase tracking-wider' : ''}`}>
                        {item.label}
                      </span>
                      {item.id === 'contracts' && <NotificationBadge type="expiring-contracts" />}
                    </>
                  )}
                </button>
                {item.children && isSidebarOpen && expandedMenus.includes(item.id) && (
                  <div className="pl-8">
                    {(item.children || []).map(child => {
                      const isChildActive = location.pathname === child.path;

                      return (
                        <div key={child.id}>
                        {child.subGroupLabel && (
                          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            {child.subGroupLabel}
                          </div>
                        )}
                        <button
                          onClick={() => navigate(child.path)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                            isChildActive
                              ? 'bg-blue-50 text-blue-600'
                              : isUnassigned
                                ? 'text-gray-400 hover:bg-gray-50'
                                : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {child.icon}
                          </div>
                          {isSidebarOpen && (
                            <span className="truncate flex items-center gap-1">
                              {child.label}
                              {child.isShortcut && (
                                <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              )}
                            </span>
                          )}
                        </button>
                        </div>
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
                    {user?.photo_url && <AvatarImage src={user.photo_url} alt={user.username} />}
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
                    {user?.photo_url && <AvatarImage src={user.photo_url} alt={user?.username} />}
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
                onClick={() => navigate(homePath)}
                className="hover:text-gray-700 transition-colors"
              >
                Главная
              </button>
              {location.pathname !== '/' && (() => {
                const fullPath = location.pathname.slice(1);
                const exactTitle = pageTitles[fullPath];
                if (exactTitle) {
                  const parent = pathToParent[fullPath];
                  return (
                    <>
                      {parent && (
                        <span className="flex items-center">
                          <ChevronRight className="w-4 h-4 mx-2" />
                          {menuGroupPaths.has(parent.path) ? (
                            <span className="text-gray-600">{parent.label}</span>
                          ) : (
                            <button
                              onClick={() => navigate(parent.path)}
                              className="hover:text-gray-700 transition-colors"
                            >
                              {parent.label}
                            </button>
                          )}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 mx-2" />
                      <span className="text-gray-900 font-medium">{exactTitle}</span>
                    </>
                  );
                }
                const segments = fullPath.split('/');
                const crumbs: { label: string; path: string }[] = [];
                for (let i = segments.length - 1; i >= 1; i--) {
                  const parentPath = segments.slice(0, i).join('/');
                  const parentTitle = pageTitles[parentPath];
                  if (parentTitle) {
                    // Add grandparent from menu hierarchy
                    const grandParent = pathToParent[parentPath];
                    if (grandParent) {
                      crumbs.push({ label: grandParent.label, path: grandParent.path });
                    }
                    // Allow page to override the intermediate breadcrumb (e.g. invoice inside estimate)
                    if (parentCrumb) {
                      crumbs.push({ label: parentCrumb.label, path: parentCrumb.path });
                    } else {
                      crumbs.push({ label: parentTitle, path: '/' + parentPath });
                    }
                    const lastSegment = segments[segments.length - 1];
                    const crumbLabel = detailLabel || (/^\d+$/.test(lastSegment) ? `№${lastSegment}` : lastSegment);
                    crumbs.push({ label: crumbLabel, path: '' });
                    break;
                  }
                }
                if (crumbs.length === 0) {
                  return (
                    <>
                      <ChevronRight className="w-4 h-4 mx-2" />
                      <span className="text-gray-900 font-medium">{fullPath}</span>
                    </>
                  );
                }
                return crumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center">
                    <ChevronRight className="w-4 h-4 mx-2" />
                    {crumb.path && !menuGroupPaths.has(crumb.path) ? (
                      <button
                        onClick={() => navigate(crumb.path)}
                        className="hover:text-gray-700 transition-colors"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span className={crumb.path ? 'text-gray-600' : 'text-gray-900 font-medium'}>{crumb.label}</span>
                    )}
                  </span>
                ));
              })()}
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