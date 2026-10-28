import './styles/theme.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ToastProvider } from './lib/toast';
import { GamePage } from './pages/GamePage';
import { Home } from './pages/Home';
import { Room } from './pages/Room';

function JoinRedirect() {
  const { code = '' } = useParams();
  return <Navigate to={`/room/${code.toUpperCase()}`} replace />;
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games/:gameId" element={<GamePage />} />
        <Route path="/join/:code" element={<JoinRedirect />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  </BrowserRouter>,
);
