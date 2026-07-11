import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import { HostPage } from './pages/HostPage';
import {
  HOST_DOCUMENT_TITLE,
  PLAYER_DOCUMENT_TITLE,
} from './components/GameTitle';
import './index.css';

// Set tab title before React mounts (also works if a route crashes early).
// LAN HTTP is not a secure context — keep this side-effect free of crypto APIs.
document.title = window.location.pathname.startsWith('/join')
  ? PLAYER_DOCUMENT_TITLE
  : HOST_DOCUMENT_TITLE;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/host" replace />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/join/:roomCode" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
