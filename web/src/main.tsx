// Fansub Night type: title cards, interface and captions, numbers.
// The app's text is in Latin script; prompts and names can be in Vietnamese, Cyrillic or Greek too.
// Only those subsets ship (the fonts' Japanese ones were most of the package); Japanese text in a
// prompt falls back to the system's own fonts.
import '@fontsource/shippori-mincho-b1/latin-800.css';
import '@fontsource/shippori-mincho-b1/latin-ext-800.css';
import '@fontsource/m-plus-rounded-1c/latin-500.css';
import '@fontsource/m-plus-rounded-1c/latin-ext-500.css';
import '@fontsource/m-plus-rounded-1c/vietnamese-500.css';
import '@fontsource/m-plus-rounded-1c/cyrillic-500.css';
import '@fontsource/m-plus-rounded-1c/greek-500.css';
import '@fontsource/m-plus-rounded-1c/latin-700.css';
import '@fontsource/m-plus-rounded-1c/latin-ext-700.css';
import '@fontsource/m-plus-rounded-1c/vietnamese-700.css';
import '@fontsource/m-plus-rounded-1c/cyrillic-700.css';
import '@fontsource/m-plus-rounded-1c/greek-700.css';
import '@fontsource/m-plus-rounded-1c/latin-800.css';
import '@fontsource/m-plus-rounded-1c/latin-ext-800.css';
import '@fontsource/m-plus-rounded-1c/vietnamese-800.css';
import '@fontsource/m-plus-rounded-1c/cyrillic-800.css';
import '@fontsource/m-plus-rounded-1c/greek-800.css';
import '@fontsource/m-plus-1-code/latin-400.css';
import '@fontsource/m-plus-1-code/latin-ext-400.css';
import '@fontsource/m-plus-1-code/vietnamese-400.css';
import '@fontsource/m-plus-1-code/latin-600.css';
import '@fontsource/m-plus-1-code/latin-ext-600.css';
import '@fontsource/m-plus-1-code/vietnamese-600.css';
import './styles.css';
import './extras.css';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { preloadAssets } from './lib/assetCache';
import { worldUi } from './office/world';

// the open theme's saved scene starts loading now, while the rest of the app does
void preloadAssets(worldUi.get().id);
import App from './App';

// `?proto=<name>` renders a concept test scene full-screen instead of the app.
const proto = new URLSearchParams(location.search).get('proto');
const Proto = lazy(() => import('./proto/Proto'));

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {proto ? (
      <Suspense fallback={null}>
        <Proto name={proto} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
