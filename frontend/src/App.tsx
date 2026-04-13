import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import { RouteLoadingFallback } from './components/common/RouteLoadingFallback';
import './App.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const MyContributions = lazy(() => import('./pages/MyContributions'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Organizations = lazy(() => import('./pages/Organizations'));
const OrganizationDetail = lazy(() => import('./pages/OrganizationDetail'));
const Contributors = lazy(() => import('./pages/Contributors'));
const About = lazy(() => import('./pages/About'));
const SystemStatus = lazy(() => import('./pages/SystemStatus'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export { queryClient };

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/me" element={<MyContributions />} />
                <Route path="/organizations" element={<Organizations />} />
                <Route path="/organizations/:org" element={<OrganizationDetail />} />
                <Route path="/organizations/:org/projects/:projectId" element={<ProjectDetail />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:projectId" element={<ProjectDetail />} />
                <Route path="/contributors" element={<Contributors />} />
                <Route path="/system" element={<SystemStatus />} />
                <Route path="/about" element={<About />} />
              </Route>
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
