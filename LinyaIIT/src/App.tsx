import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isSupabaseConfigured } from './lib/supabase';
import { SetupBanner } from './components/SetupBanner';
import { StudentPage } from './pages/StudentPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage';
import { DisplayBoardPage } from './pages/DisplayBoardPage';

export function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SetupBanner />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentPage />} />
        <Route path="/display" element={<DisplayBoardPage />} />
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route path="/staff" element={<StaffDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
