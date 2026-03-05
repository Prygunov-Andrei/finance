import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { api } from './lib/api';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Counterparties } from './components/Counterparties';
import { CounterpartyDetail } from './components/CounterpartyDetail';
import { ConstructionObjects } from './components/ConstructionObjects';
import { ObjectDetail } from './components/ObjectDetail';
import { ContractsList } from './components/contracts/ContractsList';
import { ContractDetail } from './components/contracts/ContractDetail';
import { ActsList } from './components/contracts/ActsList';
import { ActDetail } from './components/ActDetail';
import { ContractEstimateDetail } from './components/contracts/ContractEstimateDetail';
import { ActDetailPage } from './components/contracts/ActDetailPage';
import { Projects } from './components/estimates/Projects';
import { ProjectDetail } from './components/estimates/ProjectDetail';
import { Estimates } from './components/estimates/Estimates';
import { EstimateDetail } from './components/estimates/EstimateDetail';
import { MountingEstimates } from './components/estimates/MountingEstimates';
import { MountingEstimateDetail } from './components/estimates/MountingEstimateDetail';
import { EstimatesPage } from './components/estimates/EstimatesPage';
import { TechnicalProposalsList } from './components/proposals/TechnicalProposalsList';
import { TechnicalProposalDetail } from './components/proposals/TechnicalProposalDetail';
import { MountingProposalsList } from './components/proposals/MountingProposalsList';
import { MountingProposalDetail } from './components/proposals/MountingProposalDetail';
import { FrontOfWorkItems } from './components/proposals/FrontOfWorkItems';
import { MountingConditions } from './components/proposals/MountingConditions';
import { FrameworkContractsList } from './components/contracts/FrameworkContractsList';
import { FrameworkContractDetail } from './components/FrameworkContractDetail';
import { CreateFrameworkContractForm } from './components/contracts/CreateFrameworkContractForm';
import { Payments } from './components/Payments';
import { PaymentRegistry } from './components/PaymentRegistry';
import { BankStatements } from './components/BankStatements';
import { BankPaymentOrders } from './components/BankPaymentOrderForm';
import { Settings } from './components/Settings';
import { AccountDetail } from './components/AccountDetail';
import { Communications } from './components/Communications';
import { PriceLists } from './components/pricelists/PriceLists';
import { CreatePriceList } from './components/pricelists/CreatePriceList';
import { PriceListDetail } from './components/pricelists/PriceListDetail';
import { WorkItems } from './components/pricelists/WorkItems';
import { WorkItemDetail } from './components/pricelists/WorkItemDetail';
import { WorkSections } from './components/pricelists/WorkSections';
import { WorkerGrades } from './components/pricelists/WorkerGrades';
import { WorkerGradeSkillsComponent } from './components/pricelists/WorkerGradeSkills';
import { CatalogCategories } from './components/catalog/CatalogCategories';
import { CatalogProducts } from './components/catalog/CatalogProducts';
import { ProductDetail } from './components/catalog/ProductDetail';
import { CatalogModeration } from './components/catalog/CatalogModeration';
import { InvoicesPage } from './components/supply/InvoicesPage';
import { InvoiceDetailPage } from './components/supply/InvoiceDetailPage';
import { SupplyRequestsPage } from './components/supply/SupplyRequestsPage';
import { RecurringPaymentsPage } from './components/supply/RecurringPaymentsPage';
import { IncomeRecordsPage } from './components/supply/IncomeRecordsPage';
import { SupplyDashboardPage } from './components/supply/SupplyDashboardPage';
import { BitrixSettingsPage } from './components/supply/BitrixSettingsPage';
import { KanbanBoardPage, KanbanBoardConfig } from './components/kanban/KanbanBoardPage';
import { CreateCommercialCardDialog } from './components/kanban/CreateCommercialCardDialog';
import { KanbanCardDetailDialog } from './components/kanban/KanbanCardDetailDialog';
import { WarehouseBalancesPage } from './components/warehouse/WarehouseBalancesPage';
import { StubPage } from './components/StubPage';
import { PersonnelTab } from './components/PersonnelTab';
import { FinanceDashboard } from './components/finance/FinanceDashboard';
import { PaymentsTabPage } from './components/finance/PaymentsTabPage';
import { WorkConditionsPage } from './components/references/WorkConditionsPage';
import { MarkdownPage } from './components/help/MarkdownPage';
import { HelpIndexPage } from './components/help/HelpIndexPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionsContext, buildPermissionsValue } from './hooks/usePermissions';
import { BreadcrumbProvider } from './hooks/useBreadcrumb';

const commercialBoardConfig: KanbanBoardConfig = {
  renderCreateDialog: (props) => (
    <CreateCommercialCardDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      boardId={props.boardId}
      firstColumnId={props.firstColumnId}
      cardType={props.cardType}
      onCreated={props.onCreated}
    />
  ),
  renderDetailDialog: (props) => (
    <KanbanCardDetailDialog
      card={props.card}
      open={props.open}
      onOpenChange={props.onOpenChange}
      allColumns={props.allColumns}
      onUpdated={props.onUpdated}
    />
  ),
};

// Создаем QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Не повторяем при сетевых ошибках больше 1 раза
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNetworkError = errorMessage.includes('Сетевая ошибка') || 
                               errorMessage.includes('Failed to fetch') ||
                               errorMessage.includes('NetworkError');
        
        if (isNetworkError) {
          return failureCount < 1; // Только одна попытка
        }
        return failureCount < 2; // Две попытки для остальных ошибок
      },
      staleTime: 5 * 60 * 1000, // 5 минут
      // Не показываем ошибки в консоли для сетевых проблем
      onError: (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNetworkError = errorMessage.includes('Сетевая ошибка') || 
                               errorMessage.includes('Failed to fetch') ||
                               errorMessage.includes('NetworkError');
        
        if (!isNetworkError) {
          // Query error logged
        }
      },
    },
  },
});

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  const permissionsValue = useMemo(() => buildPermissionsValue(user), [user]);

  const sectionToPath: Record<string, string> = {
    dashboard: '/dashboard',
    commercial: '/proposals/technical-proposals',
    objects: '/objects',
    finance: '/finance/dashboard',
    contracts: '/contracts',
    supply: '/supply/invoices',
    pto: '/pto/production-docs',
    marketing: '/marketing/search',
    communications: '/communications',
    settings: '/settings',
    help: '/help',
  };

  const getFirstAvailablePath = (): string => {
    const sectionOrder = ['dashboard', 'commercial', 'objects', 'finance', 'contracts', 'supply', 'pto', 'marketing', 'communications', 'settings', 'help'];
    for (const section of sectionOrder) {
      if (permissionsValue.hasAccess(section)) {
        return sectionToPath[section] || '/dashboard';
      }
    }
    return '/help';
  };

  const ProtectedRoute = ({ children, requiredSection }: { children: React.ReactNode; requiredSection?: string }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    if (requiredSection && !permissionsValue.hasAccess(requiredSection)) {
      return <Navigate to={getFirstAvailablePath()} replace />;
    }
    return <>{children}</>;
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const userData = await api.getCurrentUser();
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          // Ошибка загрузки пользователя
          
          // Проверяем, является ли это сетевой ошибкой
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isNetworkError = errorMessage.includes('Сетевая ошибка') || 
                                 errorMessage.includes('Failed to fetch') ||
                                 errorMessage.includes('NetworkError');
          
          if (isNetworkError) {
            // При сетевой ошибке оставляем пользователя авторизованным
            // Данные будут загружены, когда сервер станет доступен
            setIsAuthenticated(true);
            toast.warning('Сервер временно недоступен', {
              description: 'Проверьте подключение к интернету или попробуйте позже. Некоторые функции могут быть ограничены.',
              duration: 5000,
            });
          } else {
            // Токен невалиден или истек - очищаем и разлогиниваем
            api.logout();
            setIsAuthenticated(false);
            setUser(null);
          }
        }
      }
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await api.getCurrentUser();
      setUser(userData);
    } catch (error) {
      // Не разлогиниваем, просто оставляем user = null
      // Пользователь всё равно авторизован по токену
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    // Загружаем данные пользователя в фоне, не блокируя вход
    loadUser();
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
    setUser(null);
    // После выхода React Router перенаправит на /login через ProtectedRoute
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-500">Загрузка...</div>
        </div>
      </div>
    );
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <PermissionsContext.Provider value={permissionsValue}>
      <BreadcrumbProvider>
      <Router>
        <Routes>
          <Route 
            path="/login" 
            element={
              isAuthenticated 
                ? <Navigate to={getFirstAvailablePath()} replace /> 
                : <Login onLogin={handleLogin} />
            } 
          />
          <Route path="/" element={<Navigate to={getFirstAvailablePath()} replace />} />
          <Route path="/dashboard" element={
            <ProtectedRoute requiredSection="dashboard">
              <Layout onLogout={handleLogout} user={user}>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/counterparties" element={
            <ProtectedRoute requiredSection="settings.counterparties">
              <Layout onLogout={handleLogout} user={user}>
                <Counterparties />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/counterparties/:id" element={
            <ProtectedRoute requiredSection="settings.counterparties">
              <Layout onLogout={handleLogout} user={user}>
                <CounterpartyDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/objects" element={
            <ProtectedRoute requiredSection="objects">
              <Layout onLogout={handleLogout} user={user}>
                <ConstructionObjects defaultStatusFilter="in_progress" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/objects/:id" element={
            <ProtectedRoute requiredSection="objects">
              <Layout onLogout={handleLogout} user={user}>
                <ObjectDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/projects" element={
            <ProtectedRoute requiredSection="pto.projects">
              <Layout onLogout={handleLogout} user={user}>
                <Projects />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/projects/:id" element={
            <ProtectedRoute requiredSection="pto.projects">
              <Layout onLogout={handleLogout} user={user}>
                <ProjectDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/estimates" element={
            <ProtectedRoute requiredSection="commercial.estimates">
              <Layout onLogout={handleLogout} user={user}>
                <EstimatesPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/estimates/:id" element={
            <ProtectedRoute requiredSection="commercial.estimates">
              <Layout onLogout={handleLogout} user={user}>
                <EstimateDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/invoices/:id" element={
            <ProtectedRoute requiredSection="commercial.estimates">
              <Layout onLogout={handleLogout} user={user}>
                <InvoiceDetailPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/mounting-estimates" element={
            <Navigate to="/estimates/estimates?tab=mounting" replace />
          } />
          <Route path="/estimates/mounting-estimates/:id" element={
            <ProtectedRoute requiredSection="commercial.estimates">
              <Layout onLogout={handleLogout} user={user}>
                <MountingEstimateDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/technical-proposals" element={
            <ProtectedRoute requiredSection="commercial.tkp">
              <Layout onLogout={handleLogout} user={user}>
                <TechnicalProposalsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/technical-proposals/:id" element={
            <ProtectedRoute requiredSection="commercial.tkp">
              <Layout onLogout={handleLogout} user={user}>
                <TechnicalProposalDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/mounting-proposals" element={
            <ProtectedRoute requiredSection="commercial.mp">
              <Layout onLogout={handleLogout} user={user}>
                <MountingProposalsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/mounting-proposals/:id" element={
            <ProtectedRoute requiredSection="commercial.mp">
              <Layout onLogout={handleLogout} user={user}>
                <MountingProposalDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/front-of-work-items" element={
            <ProtectedRoute requiredSection="settings.work_conditions">
              <Layout onLogout={handleLogout} user={user}>
                <FrontOfWorkItems />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/mounting-conditions" element={
            <ProtectedRoute requiredSection="settings.work_conditions">
              <Layout onLogout={handleLogout} user={user}>
                <MountingConditions />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts" element={
            <ProtectedRoute requiredSection="contracts.object_contracts">
              <Layout onLogout={handleLogout} user={user}>
                <ContractsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts" element={
            <ProtectedRoute requiredSection="contracts.framework">
              <Layout onLogout={handleLogout} user={user}>
                <FrameworkContractsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts/create" element={
            <ProtectedRoute requiredSection="contracts.framework">
              <Layout onLogout={handleLogout} user={user}>
                <CreateFrameworkContractForm />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts/:id/edit" element={
            <ProtectedRoute requiredSection="contracts.framework">
              <Layout onLogout={handleLogout} user={user}>
                <CreateFrameworkContractForm />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts/:id" element={
            <ProtectedRoute requiredSection="contracts.framework">
              <Layout onLogout={handleLogout} user={user}>
                <FrameworkContractDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/estimates/:id" element={
            <ProtectedRoute requiredSection="contracts.estimates">
              <Layout onLogout={handleLogout} user={user}>
                <ContractEstimateDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/acts" element={
            <ProtectedRoute requiredSection="contracts.acts">
              <Layout onLogout={handleLogout} user={user}>
                <ActsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/acts/:id" element={
            <ProtectedRoute requiredSection="contracts.acts">
              <Layout onLogout={handleLogout} user={user}>
                <ActDetailPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/instructions" element={
            <ProtectedRoute requiredSection="contracts">
              <Layout onLogout={handleLogout} user={user}>
                <MarkdownPage filePath="contracts/instructions.md" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/:id" element={
            <ProtectedRoute requiredSection="contracts.object_contracts">
              <Layout onLogout={handleLogout} user={user}>
                <ContractDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute requiredSection="settings.config">
              <Layout onLogout={handleLogout} user={user}>
                <Settings />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings/accounts/:id" element={
            <ProtectedRoute requiredSection="settings.config">
              <Layout onLogout={handleLogout} user={user}>
                <AccountDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/communications" element={
            <ProtectedRoute requiredSection="communications">
              <Layout onLogout={handleLogout} user={user}>
                <Communications />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/categories" element={
            <ProtectedRoute requiredSection="goods.categories">
              <Layout onLogout={handleLogout} user={user}>
                <CatalogCategories />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/products" element={
            <ProtectedRoute requiredSection="goods.catalog">
              <Layout onLogout={handleLogout} user={user}>
                <CatalogProducts />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/products/:id" element={
            <ProtectedRoute requiredSection="goods.catalog">
              <Layout onLogout={handleLogout} user={user}>
                <ProductDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/moderation" element={
            <ProtectedRoute requiredSection="goods.moderation">
              <Layout onLogout={handleLogout} user={user}>
                <CatalogModeration />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/payments" element={
            <Navigate to="/finance/payments?tab=invoices" replace />
          } />
          <Route path="/payment-registry" element={
            <Navigate to="/finance/payments?tab=registry" replace />
          } />
          <Route path="/bank-statements" element={
            <ProtectedRoute requiredSection="finance.statements">
              <Layout onLogout={handleLogout} user={user}>
                <BankStatements />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/bank-payment-orders" element={
            <ProtectedRoute requiredSection="finance.payments">
              <Layout onLogout={handleLogout} user={user}>
                <BankPaymentOrders />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/price-lists" element={
            <ProtectedRoute requiredSection="goods.pricelists">
              <Layout onLogout={handleLogout} user={user}>
                <PriceLists />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/price-lists/create" element={
            <ProtectedRoute requiredSection="goods.pricelists">
              <Layout onLogout={handleLogout} user={user}>
                <CreatePriceList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/price-lists/:id" element={
            <ProtectedRoute requiredSection="goods.pricelists">
              <Layout onLogout={handleLogout} user={user}>
                <PriceListDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/work-items" element={
            <ProtectedRoute requiredSection="goods.works">
              <Layout onLogout={handleLogout} user={user}>
                <WorkItems />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/work-items/:id" element={
            <ProtectedRoute requiredSection="goods.works">
              <Layout onLogout={handleLogout} user={user}>
                <WorkItemDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/work-sections" element={
            <ProtectedRoute requiredSection="goods.works">
              <Layout onLogout={handleLogout} user={user}>
                <WorkSections />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/worker-grades" element={
            <ProtectedRoute requiredSection="goods.grades">
              <Layout onLogout={handleLogout} user={user}>
                <WorkerGrades />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/worker-grade-skills" element={
            <ProtectedRoute requiredSection="goods.grades">
              <Layout onLogout={handleLogout} user={user}>
                <WorkerGradeSkillsComponent />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Supply Module */}
          <Route path="/supply/invoices" element={
            <ProtectedRoute requiredSection="supply.invoices">
              <Layout onLogout={handleLogout} user={user}>
                <InvoicesPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/supply/invoices/:id" element={
            <ProtectedRoute requiredSection="supply.invoices">
              <Layout onLogout={handleLogout} user={user}>
                <InvoiceDetailPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/supply/requests" element={
            <ProtectedRoute requiredSection="supply">
              <Layout onLogout={handleLogout} user={user}>
                <SupplyRequestsPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/supply/recurring" element={
            <ProtectedRoute requiredSection="finance.recurring">
              <Layout onLogout={handleLogout} user={user}>
                <RecurringPaymentsPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/supply/income" element={
            <ProtectedRoute requiredSection="finance.payments">
              <Layout onLogout={handleLogout} user={user}>
                <IncomeRecordsPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/supply/dashboard" element={
            <ProtectedRoute requiredSection="supply">
              <Layout onLogout={handleLogout} user={user}>
                <SupplyDashboardPage />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Kanban (API-first service) */}
          <Route path="/kanban/supply" element={
            <ProtectedRoute requiredSection="supply.kanban">
              <Layout onLogout={handleLogout} user={user}>
                <KanbanBoardPage boardKey="supply" pageTitle="Канбан снабжения" cardType="supply_case" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/kanban/object-tasks" element={
            <ProtectedRoute requiredSection="objects">
              <Layout onLogout={handleLogout} user={user}>
                <KanbanBoardPage boardKey="object_tasks" pageTitle="Задачи по объектам" cardType="object_task" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/warehouse" element={
            <ProtectedRoute requiredSection="supply.warehouse">
              <Layout onLogout={handleLogout} user={user}>
                <WarehouseBalancesPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings/bitrix" element={
            <ProtectedRoute requiredSection="settings.config">
              <Layout onLogout={handleLogout} user={user}>
                <BitrixSettingsPage />
              </Layout>
            </ProtectedRoute>
          } />

          {/* === Stub pages (новые разделы — заглушки) === */}

          {/* Коммерческие предложения */}
          <Route path="/commercial/kanban" element={
            <ProtectedRoute requiredSection="commercial.kanban">
              <Layout onLogout={handleLogout} user={user}>
                <KanbanBoardPage
                  boardKey="commercial_pipeline"
                  pageTitle="Канбан КП"
                  cardType="commercial_case"
                  visibleColumnKeys={['new_calculation','in_progress','invoices_requested','estimate_approval','estimate_approved','kp_prepared']}
                  boardConfig={commercialBoardConfig}
                  tunnelRules={[
                    { fromColumnKey: 'kp_prepared', toColumnKey: 'calculation_done', buttonLabel: 'Вернуть в маркетинг' },
                  ]}
                  columnGroups={[
                    ['new_calculation','in_progress','invoices_requested','estimate_approval','estimate_approved','kp_prepared'],
                  ]}
                />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/commercial/instructions" element={
            <ProtectedRoute requiredSection="commercial">
              <Layout onLogout={handleLogout} user={user}>
                <MarkdownPage filePath="commercial/instructions.md" />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Финансы */}
          <Route path="/finance/dashboard" element={
            <ProtectedRoute requiredSection="finance.dashboard">
              <Layout onLogout={handleLogout} user={user}>
                <FinanceDashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/finance/payments" element={
            <ProtectedRoute requiredSection="finance.payments">
              <Layout onLogout={handleLogout} user={user}>
                <PaymentsTabPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/finance/instructions" element={
            <ProtectedRoute requiredSection="finance">
              <Layout onLogout={handleLogout} user={user}>
                <MarkdownPage filePath="finance.md" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/finance/debtors" element={
            <ProtectedRoute requiredSection="finance.debtors">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Дебиторская задолженность" description="Контроль дебиторской задолженности по контрагентам" parentSection="Финансы" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/finance/accounting" element={
            <ProtectedRoute requiredSection="finance.accounting">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Бухгалтерия" description="Календарь бухгалтера и налоговый учёт" parentSection="Финансы" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/finance/budget" element={
            <ProtectedRoute requiredSection="finance.budget">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Расходный бюджет" description="Бюджетирование по статьям расходов" parentSection="Финансы" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/finance/indicators" element={
            <ProtectedRoute requiredSection="finance.indicators">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Финансовые показатели" description="Оборотные средства, прибыль, отчёты, чистые активы, премии" parentSection="Финансы" />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Договоры */}
          <Route path="/contracts/household" element={
            <ProtectedRoute requiredSection="contracts.household">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Хозяйственные Договора" description="Аренда, телефония и прочие хозяйственные договоры" parentSection="Договоры" />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Снабжение и Склад */}
          <Route path="/supply/drivers" element={
            <ProtectedRoute requiredSection="supply.drivers">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Календарь водителей" description="Планирование доставок и логистики" parentSection="Снабжение и Склад" />
              </Layout>
            </ProtectedRoute>
          } />

          {/* ПТО */}
          <Route path="/pto/production-docs" element={
            <ProtectedRoute requiredSection="pto.production">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Производственная документация" description="Журналы, приказы, ППР и прочие документы" parentSection="ПТО" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/pto/executive-docs" element={
            <ProtectedRoute requiredSection="pto.executive">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Исполнительная документация" description="Комплекты исполнительной документации по объектам" parentSection="ПТО" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/pto/samples" element={
            <ProtectedRoute requiredSection="pto.samples">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Образцы документов" description="Шаблоны производственной и исполнительной документации" parentSection="ПТО" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/pto/knowledge-base" element={
            <ProtectedRoute requiredSection="pto.knowledge">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Руководящие документы" description="База знаний: нормативные и руководящие документы" parentSection="ПТО" />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Маркетинг */}
          <Route path="/marketing/objects" element={
            <ProtectedRoute requiredSection="marketing.kanban">
              <Layout onLogout={handleLogout} user={user}>
                <KanbanBoardPage
                  boardKey="commercial_pipeline"
                  pageTitle="Канбан поиска объектов"
                  cardType="commercial_case"
                  visibleColumnKeys={['new_clients','meeting_scheduled','meeting_done','calculation_done','no_result','has_result']}
                  boardConfig={commercialBoardConfig}
                  tunnelRules={[
                    { fromColumnKey: 'meeting_done', toColumnKey: 'new_calculation', buttonLabel: 'Передать на расчёт КП' },
                  ]}
                  columnGroups={[
                    ['new_clients','meeting_scheduled','meeting_done'],
                    ['calculation_done','no_result','has_result'],
                  ]}
                />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/marketing/potential-customers" element={
            <ProtectedRoute requiredSection="marketing.potential_customers">
              <Layout onLogout={handleLogout} user={user}>
                <Counterparties
                  lockedFilter="potential_customer"
                  lockedCreateType="potential_customer"
                  pageTitle="Потенциальные заказчики"
                />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/marketing/objects-list" element={
            <ProtectedRoute requiredSection="objects">
              <Layout onLogout={handleLogout} user={user}>
                <ConstructionObjects
                  pageTitle="Объекты (Маркетинг)"
                  defaultStatusFilter="planned"
                  defaultCreateStatus="planned"
                />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/marketing/executors" element={
            <ProtectedRoute requiredSection="marketing.executors">
              <Layout onLogout={handleLogout} user={user}>
                <StubPage title="Поиск Исполнителей" description="Поиск субподрядчиков и исполнителей" parentSection="Маркетинг" />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Справочники и Настройки */}
          <Route path="/references/goods" element={
            <Navigate to="/catalog/products" replace />
          } />
          <Route path="/references/work-conditions" element={
            <ProtectedRoute requiredSection="settings.work_conditions">
              <Layout onLogout={handleLogout} user={user}>
                <WorkConditionsPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings/instructions" element={
            <ProtectedRoute requiredSection="settings">
              <Layout onLogout={handleLogout} user={user}>
                <MarkdownPage filePath="settings/instructions.md" />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/personnel" element={
            <ProtectedRoute requiredSection="settings.personnel">
              <Layout onLogout={handleLogout} user={user}>
                <PersonnelTab />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Справка */}
          <Route path="/help" element={
            <ProtectedRoute requiredSection="help">
              <Layout onLogout={handleLogout} user={user}>
                <HelpIndexPage />
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
        <Toaster position="top-right" />
      </Router>
      </BreadcrumbProvider>
      </PermissionsContext.Provider>
    </QueryClientProvider>
  );
}