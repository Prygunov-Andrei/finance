import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import LandingPage from './pages/LandingPage';
import RequestStatusPage from './pages/RequestStatusPage';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/requests/:token" element={<RequestStatusPage />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  );
}
