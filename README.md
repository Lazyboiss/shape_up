# Shape Up

## Deploy to Vercel

Import this repository with the repository root as the Root Directory. The
committed `vercel.json` selects Vite, runs `npm run build`, serves `dist`, and
rewrites client-side routes (including `/createLevel`) to `index.html`.

To enable victory-photo sharing, add these environment variables in Vercel for
the environments you deploy, then redeploy:

- `VITE_SUPABASE_URL`: your Supabase project URL.
- `VITE_SUPABASE_KEY`: your publishable key or legacy anon key. Never use a secret
  or service-role key because Vite embeds these values in the browser bundle.

The existing sharing flow also requires the `pose-captures` Storage bucket and
appropriate upload/read policies. Without the variables, the game and level
editor still run; photo sharing displays an error when used. `.env.local` is
ignored by Git and is not automatically transferred to Vercel. Use `.env.example`
as a reference for local configuration.

Validate locally with `npm ci` and `npm run build` (`npm.cmd` on Windows if
PowerShell blocks `npm.ps1`). A large-chunk warning does not fail the build.

## Custom levels

Click **TRY CUSTOM LEVEL GENERATOR** on the home screen, or visit `/createLevel`.
Use the tools to add platforms, a spawn for each player, and a flag for each
player. Click **Test Level** to play with WASD and arrow keys. After clearing the
level, enter a filename and use **Save Level** to download its JSON; **Load Level**
imports a saved file. **Back to Menu** returns home and discards the current
unsaved editor session.

---

## Vite template reference

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
