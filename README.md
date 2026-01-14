# Fullstack Monorepo Template

A pnpm monorepo for fullstack web applications with AWS CDK backend and React frontend.

## Stack

- **Frontend**: React + Vite + Zustand (deployed to CloudFront)
- **Backend**: AWS Lambda (TypeScript or Python) + API Gateway (REST & WebSocket)
- **Infrastructure**: AWS CDK (TypeScript)

## Project Structure

```
├── packages/
│   ├── frontend/        # React application
│   ├── backend/         # Lambda functions (TypeScript & Python)
│   ├── shared/          # Shared types between frontend/backend
│   ├── lambda-layer/    # Shared dependencies for Lambda functions
│   └── infra/           # AWS CDK infrastructure
├── scripts/             # CLI tools (create-function, etc.)
└── .husky/              # Git hooks (auto-format on commit)
```

## Prerequisites

- Node.js >= 20
- pnpm (`npm install -g pnpm`)
- AWS CLI (`brew install awscli` or [install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- AWS CDK CLI (`npm install -g aws-cdk`)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd monorepo-web-stack
pnpm install
```

This automatically sets up Git hooks (via Husky) that format and lint your code on commit.

### 2. Configure AWS Profile

Each project uses an **AWS Profile** to ensure you deploy to the correct account. This is important if you have multiple AWS accounts (work, personal, etc.).

**View your existing profiles:**
```bash
aws configure list-profiles
```

**See details of a profile (which account it points to):**
```bash
aws sts get-caller-identity --profile my-profile-name
```

**Create a new profile:**
```bash
aws configure --profile my-new-profile
```

You'll be prompted for:
- **AWS Access Key ID** - from IAM console (see below)
- **AWS Secret Access Key** - from IAM console
- **Default region** - e.g., `us-east-1`
- **Output format** - press Enter for default

**To get Access Keys:**
1. Go to AWS Console → IAM → Users → Your User
2. Security credentials tab → Create access key
3. Choose "Command Line Interface (CLI)"
4. Save the keys securely (you can't view the secret again)

### 3. Configure your project

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Your app name - used as prefix for all AWS resources (e.g., "myapp" creates stacks like "myapp-ApiStack-dev", "myapp-FrontendStack-prod")
APP_NAME=myapp

# Your AWS profile name
AWS_PROFILE=my-profile-name
```

**APP_NAME** is the prefix for all AWS resources created by this project:
- CloudFormation stacks: `myapp-ApiStack-dev`, `myapp-FrontendStack-prod`
- Lambda functions: `myapp-health-dev`, `myapp-users-prod`
- S3 buckets: `myapp-frontend-dev-123456789`

This keeps your resources organized and easy to find in the AWS console.

### 4. Bootstrap CDK (first time per account/region)

```bash
pnpm cdk:bootstrap
```

## Development

### Run frontend locally

```bash
pnpm dev
```

Starts Vite dev server at `http://localhost:3000`.

### Working with packages

You can run commands from the repo root or from within a package folder:

**From repo root** (using pnpm filters):
```bash
pnpm dev                                      # Run frontend dev server
pnpm --filter @monorepo/frontend add axios    # Add package to frontend
pnpm --filter @monorepo/backend add zod       # Add package to backend
```

**From package folder**:
```bash
cd packages/frontend
pnpm dev              # Run dev server
pnpm add axios        # Add package
```

Both approaches work. See [Frontend README](./packages/frontend/README.md) for more details.

### Create a new Lambda function

```bash
pnpm create:function
```

Interactive CLI that scaffolds TypeScript or Python functions for REST API or WebSocket.

## Commands

### Code Quality

| Command | Description |
|---------|-------------|
| `pnpm format` | Format all files with Prettier |
| `pnpm lint` | Run ESLint on all packages |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm check` | Run all checks (format, lint, typecheck) |
| `pnpm fix` | Auto-fix all (format + lint) |

### Deployment

| Command | Description |
|---------|-------------|
| `pnpm deploy:backend:dev` | Deploy all backend stacks to dev |
| `pnpm deploy:backend:staging` | Deploy all backend stacks to staging |
| `pnpm deploy:backend:prod` | Deploy all backend stacks to prod |
| `pnpm deploy:backend:api:dev` | Deploy only REST API stack to dev |
| `pnpm deploy:backend:ws:dev` | Deploy only WebSocket stack to dev |
| `pnpm deploy:frontend:staging` | Deploy frontend to staging |
| `pnpm deploy:frontend:prod` | Deploy frontend to prod |

### Push (Format + Lint + Build + Deploy)

| Command | Description |
|---------|-------------|
| `pnpm push:staging` | Full deploy to staging (runs checks first) |
| `pnpm push:prod` | Full deploy to production (runs checks first) |

### Rollback

| Command | Description |
|---------|-------------|
| `pnpm rollback:backend:staging` | Interactive rollback for staging Lambdas |
| `pnpm rollback:backend:prod` | Interactive rollback for prod Lambdas |

Rollback shows you all available versions and lets you choose:
```
Available versions for my-function:
  1. v5 (current) - deployed 2024-01-13 10:30
  2. v4 - deployed 2024-01-12 15:20
  3. v3 - deployed 2024-01-10 09:15
Select version to rollback to: _
```

## CDK Stacks

Backend is split into separate stacks for faster deploys:

- **SharedStack**: Lambda layer with shared dependencies
- **ApiStack**: REST API Gateway + Lambda functions
- **WebSocketStack**: WebSocket API Gateway + handlers
- **FrontendStack**: S3 bucket + CloudFront distribution

When you change only one Lambda, deploy just that stack:
```bash
pnpm deploy:backend:api:dev  # Only deploys ApiStack
```

## Versioning & Rollback

Staging and prod deployments are versioned for instant rollback. Dev is not versioned.

### How it works

**Frontend:**
```
S3 bucket:
├── deploys/
│   ├── v1/     # Old version
│   ├── v2/     # Previous version
│   └── v3/     # Current ← CloudFront points here
```

- Each deploy creates a new version folder
- CloudFront origin path switches to new version (zero downtime)
- Rollback = change origin path back to previous version
- Old versions beyond the last N are automatically deleted

**Backend (Lambda):**
- Each deploy creates a new Lambda version
- Alias (`staging`/`prod`) points to current version
- Rollback = update alias to point to previous version
- Old versions beyond the last N are automatically deleted

### Configuration

In `.env`:
```env
VERSIONS_TO_KEEP=5   # Keep last 5 versions for rollback
```

### SSM Parameter Store

We use [AWS SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html) to track the current frontend version number.

**What is SSM Parameter Store?**
- Simple key-value config storage (NOT the same as Secrets Manager)
- Free tier for standard parameters
- Scripts and Lambdas can read/write values
- Good for: config values, feature flags, version tracking

**How we use it:**
```
Parameter: /myapp/prod/frontend/current-version
Value: "5"
```

The deploy script reads current version, increments it, deploys, then writes the new version back. This persists the version number between deploys.

## Git Hooks (Husky)

On every commit, Husky automatically:
1. Formats staged files with Prettier
2. Runs ESLint on staged files
3. Blocks commit if there are errors

This happens automatically after `pnpm install` - no manual setup needed.

## Package READMEs

- [Frontend](./packages/frontend/README.md) - React app setup and development
- [Backend](./packages/backend/README.md) - Lambda function development (TS & Python)