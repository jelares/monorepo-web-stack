# Lambda Layer

Shared dependencies and utilities for all Lambda functions.

## Adding Dependencies

### TypeScript

Add packages to `nodejs/package.json`:

```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.500.0",
    "your-new-package": "^1.0.0"
  }
}
```

Then use in any TypeScript Lambda:

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import yourPackage from "your-new-package";
```

### Python

Add packages to `python/requirements.txt`:

```
boto3>=1.34.0
your-new-package>=1.0.0
```

Then use in any Python Lambda:

```python
import boto3
import your_new_package
```

**That's it.** CDK handles packaging and attaching the layer to your Lambdas automatically.

---

## Shared Utilities

### TypeScript

Shared code lives in `packages/backend/lib/`. It's automatically bundled into each Lambda.

```typescript
// packages/backend/lib/response.ts exists
// Use it in any Lambda:
import { success, error } from "../../lib/response.js";
```

### Python

Shared code lives in `python/shared/`. It's included in the layer.

```python
# Use the built-in helpers:
from shared import success, error, get_logger

logger = get_logger(__name__)

def handler(event, context):
    logger.info("Processing request")
    return success({"message": "Hello"})
```

To add new shared Python utilities:

1. Create file in `python/shared/` (e.g., `database.py`)
2. Export it in `python/shared/__init__.py`
3. Import in your Lambdas: `from shared import your_function`

---

## Structure

```
lambda-layer/
├── nodejs/
│   └── package.json        # TS dependencies (add packages here)
└── python/
    ├── requirements.txt    # Python dependencies (add packages here)
    └── shared/             # Python shared utilities
        ├── __init__.py
        ├── response.py
        └── logger.py
```
