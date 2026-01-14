# Backend

Lambda functions for REST API and WebSocket endpoints.

## Structure

```
functions/
├── ts/                    # TypeScript functions
│   ├── api/               # REST API handlers
│   │   └── health.ts
│   └── websocket/         # WebSocket handlers
│       └── connect.ts
└── python/                # Python functions
    ├── api/
    │   └── health.py
    └── websocket/
        └── connect.py
```

## Creating Functions

Use the CLI from the repo root:

```bash
pnpm create:function
```

This prompts you to choose:
- Language (TypeScript or Python)
- Type (REST API or WebSocket)
- Function name

## TypeScript Functions

Use the response helpers from `lib/response.ts`:

```typescript
import type { APIGatewayProxyHandler } from 'aws-lambda';
import { success, error, notFound } from '../../lib/response.js';

export const handler: APIGatewayProxyHandler = async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return notFound('ID required');
  }

  try {
    const data = await fetchSomething(id);
    return success(data);
  } catch (err) {
    return error(err.message, 500);
  }
};
```

## Python Functions

```python
import json

def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({"success": True, "data": {...}}),
    }
```

## WebSocket Handlers

WebSocket APIs need these handlers:
- `connect.ts/.py` - Called when client connects (`$connect` route)
- `disconnect.ts/.py` - Called when client disconnects (`$disconnect` route)
- `message.ts/.py` - Default handler for messages (`$default` route)

Access connection ID via `event.requestContext.connectionId`.

## Shared Types

Import types from the shared package:

```typescript
import type { User, ApiResponse } from '@monorepo/shared';
```
