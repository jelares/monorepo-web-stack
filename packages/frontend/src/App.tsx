import { useAppStore } from './store';

function App() {
  const { count, increment } = useAppStore();

  return (
    <div>
      <h1>Hello World</h1>
      <p>Count: {count}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
}

export default App;