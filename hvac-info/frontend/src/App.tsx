import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ManufacturersPage from './pages/ManufacturersPage';
import BrandsPage from './pages/BrandsPage';
import ResourcesPage from './pages/ResourcesPage';
import NewsList from './pages/NewsList';
import NewsDetail from './pages/NewsDetail';
import NewsEditor from './pages/NewsEditor';
import DraftsPage from './pages/DraftsPage';
import ScheduledPage from './pages/ScheduledPage';
import NewsNotFound from './pages/NewsNotFound';
import SearchSettingsPage from './pages/SearchSettingsPage';
import DiscoveryAnalyticsPage from './pages/DiscoveryAnalyticsPage';
import FeedbackPage from './pages/FeedbackPage';
import ApiSettings from './pages/ApiSettings';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from './components/ui/sonner';
import './config/i18n'; // Initialize i18n

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <LanguageProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<NewsList />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/news" element={<NewsList />} />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="/manufacturers" element={<ManufacturersPage />} />
              <Route path="/brands" element={<BrandsPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/api-settings" element={<ApiSettings />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              {/* Admin routes */}
              <Route
                path="/news/create"
                element={
                  <ProtectedRoute>
                    <NewsEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/news/edit/:id"
                element={
                  <ProtectedRoute>
                    <NewsEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/drafts"
                element={
                  <ProtectedRoute>
                    <DraftsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/scheduled"
                element={
                  <ProtectedRoute>
                    <ScheduledPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/news/not-found"
                element={
                  <ProtectedRoute>
                    <NewsNotFound />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/search-settings"
                element={
                  <ProtectedRoute>
                    <SearchSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/discovery-analytics"
                element={
                  <ProtectedRoute>
                    <DiscoveryAnalyticsPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
            <Toaster />
          </AuthProvider>
        </LanguageProvider>
      </Router>
    </ErrorBoundary>
  );
}