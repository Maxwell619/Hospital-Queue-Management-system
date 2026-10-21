import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTickets } from './ticketHistory';

// ---------------------------------------------------------------------
// Each entry is one button in the sidebar.
//   group  - heading the button is listed under
//   label  - text on the button
//   path   - the route (also used to highlight the active page)
//   roles  - optional; staff types allowed to see it in a normal build
// Ticket buttons are added automatically below, one per ticket registered
// in this browser (see ticketHistory.js).
// ---------------------------------------------------------------------
const PAGES = [
  { group: 'Patient', label: 'Register / join queue', path: '/' },
  {
    group: 'Staff',
    label: 'Staff dashboard',
    path: '/dashboard',
    roles: ['receptionist', 'triage_nurse', 'facilitator', 'administrator'],
  },
  {
    group: 'Staff',
    label: 'Analytics',
    path: '/analytics',
    roles: ['administrator'],
  },
  // Add an Admin entry here when you create an /admin route.
];

// While developing (or with VITE_SHOW_ALL_PAGES=true in the client's .env)
// every page is listed so you can jump anywhere during a demo. In a normal
// build, staff pages only appear to logged-in staff with the right role.
const SHOW_ALL_PAGES = import.meta.env.DEV || import.meta.env.VITE_SHOW_ALL_PAGES === 'true';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Read on every render; the sidebar re-renders on each navigation, so a
  // ticket registered a moment ago shows up as soon as the ticket page opens.
  const ticketPages = getTickets().map((n) => ({
    group: 'Patient',
    label: `Ticket #${n}`,
    path: `/ticket/${n}`,
  }));

  const visible = [
    PAGES[0], // Register / join queue
    ...ticketPages,
    ...PAGES.slice(1),
  ].filter((p) => SHOW_ALL_PAGES || !p.roles || (user && p.roles.includes(user.staffType)));
  const groups = [...new Set(visible.map((p) => p.group))];

  // '/' only matches the exact home page; other paths also match their children.
  const isActive = (p) =>
    location.pathname === p.path || location.pathname.startsWith(`${p.path}/`);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-title">Queue Management</div>

      <nav aria-label="Pages">
        {groups.map((group) => (
          <div className="app-sidebar-group" key={group}>
            <div className="app-sidebar-group-label">{group}</div>
            {visible
              .filter((p) => p.group === group)
              .map((p) => {
                const active = isActive(p);
                return (
                  <Link
                    key={p.path}
                    to={p.path}
                    className={`app-nav-button${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {p.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="app-sidebar-footer">
        {user ? (
          <>
            <div className="app-sidebar-user">
              {user.name}
              <span>{user.staffType.replace('_', ' ')}</span>
            </div>
            <button className="app-nav-button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className={`app-nav-button${location.pathname === '/login' ? ' active' : ''}`}
            aria-current={location.pathname === '/login' ? 'page' : undefined}
          >
            Log in
          </Link>
        )}
      </div>
    </aside>
  );
}
