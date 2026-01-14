# Frontend

React + Vite + Zustand frontend application.

## Development

### Run dev server

From repo root:
```bash
pnpm dev
```

Or from this folder:
```bash
cd packages/frontend
pnpm dev
```

Opens at http://localhost:3000

### Add a package

From repo root:
```bash
pnpm --filter @monorepo/frontend add some-package
```

Or from this folder:
```bash
pnpm add some-package
```

### Build for production

```bash
pnpm build
```

Output goes to `dist/` folder.

## Project Structure

```
src/
├── components/     # React components
├── store/          # Zustand stores
│   └── index.ts    # Main store
├── App.tsx         # Root component
└── main.tsx        # Entry point
```

## Zustand Store

State management uses Zustand. Example store in `src/store/index.ts`:

```typescript
import { create } from 'zustand';

interface AppState {
  count: number;
  increment: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

Use in components:

```tsx
import { useAppStore } from './store';

function MyComponent() {
  const { count, increment } = useAppStore();
  return <button onClick={increment}>{count}</button>;
}
```

## Using Shared Types

Import types from the shared package:

```typescript
import type { User, ApiResponse } from '@monorepo/shared';
```

## Path Aliases

`@/` maps to `src/`:

```typescript
import { useAppStore } from '@/store';
import MyComponent from '@/components/MyComponent';
```