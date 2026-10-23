import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Keep design documentation out of the normal app bundle and session lifecycle.
const WireframeWorkbench = lazy(() => import('./wireframes/WireframeWorkbench'));
const isDesignRoute = () => window.location.hash.split('?')[0] === '#/wireframes';
function ApplicationRoot() {
  const [design, setDesign] = useState(isDesignRoute);
  useEffect(() => {
    const update = () => setDesign(isDesignRoute());
    window.addEventListener('hashchange', update);
    update();
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return design
    ? <Suspense fallback={<p role="status">Opening wireframes...</p>}><WireframeWorkbench /></Suspense>
    : <App />;
}

const root = document.getElementById('root');
if (!root) throw new Error('The app root is missing.');
createRoot(root).render(<StrictMode><ApplicationRoot /></StrictMode>);
