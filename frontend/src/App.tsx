import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { api } from './lib/api';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import { useState, useEffect } from 'react';
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
import { Projects } from './components/estimates/Projects';
import { ProjectDetail } from './components/estimates/ProjectDetail';
import { Estimates } from './components/estimates/Estimates';
import { EstimateDetail } from './components/estimates/EstimateDetail';
import { MountingEstimates } from './components/estimates/MountingEstimates';
import { MountingEstimateDetail } from './components/estimates/MountingEstimateDetail';
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
import { LLMSettings } from './components/LLMSettings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

  // Компонент для защищенных роутов
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
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
      <Router>
        <Routes>
          <Route 
            path="/login" 
            element={
              isAuthenticated 
                ? <Navigate to="/dashboard" replace /> 
                : <Login onLogin={handleLogin} />
            } 
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/counterparties" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Counterparties />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/counterparties/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CounterpartyDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/objects" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ConstructionObjects />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/objects/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ObjectDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/projects" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Projects />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/projects/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ProjectDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/estimates" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Estimates />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/estimates/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <EstimateDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/mounting-estimates" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <MountingEstimates />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/estimates/mounting-estimates/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <MountingEstimateDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/technical-proposals" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <TechnicalProposalsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/technical-proposals/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <TechnicalProposalDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/mounting-proposals" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <MountingProposalsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/mounting-proposals/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <MountingProposalDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/front-of-work-items" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <FrontOfWorkItems />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/proposals/mounting-conditions" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <MountingConditions />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ContractsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <FrameworkContractsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts/create" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CreateFrameworkContractForm />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts/:id/edit" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CreateFrameworkContractForm />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/framework-contracts/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <FrameworkContractDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/acts" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ActsList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/acts/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ActDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/contracts/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ContractDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Settings />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings/accounts/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <AccountDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings/llm" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <LLMSettings />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/communications" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Communications />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/categories" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CatalogCategories />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/products" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CatalogProducts />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/products/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <ProductDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog/moderation" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CatalogModeration />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/payments" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <Payments />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/payment-registry" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <PaymentRegistry />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/price-lists" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <PriceLists />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/price-lists/create" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <CreatePriceList />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/price-lists/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <PriceListDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/work-items" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <WorkItems />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/work-items/:id" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <WorkItemDetail />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/work-sections" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <WorkSections />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/worker-grades" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <WorkerGrades />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/worker-grade-skills" element={
            <ProtectedRoute>
              <Layout onLogout={handleLogout} user={user}>
                <WorkerGradeSkillsComponent />
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
        <Toaster position="top-right" />
      </Router>
    </QueryClientProvider>
  );
}