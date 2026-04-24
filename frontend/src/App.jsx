import { Suspense, lazy, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import { Loader2 } from 'lucide-react';

const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'));
const RepeaterPage = lazy(() => import('./pages/RepeaterPage'));
const InterceptPage = lazy(() => import('./pages/InterceptPage'));
const DecoderPage = lazy(() => import('./pages/DecoderPage'));
const ComparerPage = lazy(() => import('./pages/ComparerPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const McpPage = lazy(() => import('./pages/McpPage'));
const AgentPage = lazy(() => import('./pages/AgentPage.jsx'));

const IntruderPage = () => (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary/50">
    <div className="p-4 bg-primary/5 rounded-full">
      <Loader2 size={32} className="text-primary/30" />
    </div>
    <div className="text-center">
      <p className="text-lg font-medium text-text-secondary/60">Intruder</p>
      <p className="text-xs text-text-secondary/40 mt-1">Coming Soon</p>
    </div>
  </div>
);

const GlobalLoader = () => (
  <div className="flex items-center justify-center h-full w-full bg-background-dark text-primary">
    <Loader2 className="animate-spin" size={48} />
  </div>
);

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-white bg-accent-red/20 overflow-auto h-screen">
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <details className="whitespace-pre-wrap text-text-secondary">
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Suspense fallback={<GlobalLoader />}>
          <Routes>
            <Route path="/" element={<RootLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />

              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="intercept" element={<InterceptPage />} />
              <Route path="repeater" element={<RepeaterPage />} />
              <Route path="intruder" element={<IntruderPage />} />
              <Route path="decoder" element={<DecoderPage />} />
              <Route path="comparer" element={<ComparerPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="mcp" element={<McpPage />} />
              <Route path="agent" element={<AgentPage />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}
