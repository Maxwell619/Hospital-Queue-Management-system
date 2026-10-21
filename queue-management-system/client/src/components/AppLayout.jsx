import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import './AppLayout.css';

// Wraps every page: sidebar on the left, the current page on the right.
export default function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}