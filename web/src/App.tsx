import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './layouts/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { VerifyLogin } from './pages/VerifyLogin';
import { TeamManagement } from './pages/TeamManagement';
import { KnowledgeCuration } from './pages/KnowledgeCuration';
import { FAQPage } from './pages/FAQPage';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify-login" element={<VerifyLogin />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout><Dashboard /></Layout>} path="/" />
            <Route element={<Layout><Dashboard /></Layout>} path="/c/:id" />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout><TeamManagement /></Layout>} path="/team" />
          </Route>

          <Route element={<ProtectedRoute requireModeratorOrAdmin={true} />}>
            <Route element={<Layout><KnowledgeCuration /></Layout>} path="/knowledge" />
            <Route element={<Layout><FAQPage /></Layout>} path="/faqs" />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
